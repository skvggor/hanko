import { normalizeMessageText, type ChatMessage } from "@domain/chat";
import { isDeckId, isVoteValue } from "@domain/deck";
import { validateName } from "@domain/name";
import { validateSessionName } from "@domain/sessionName";
import { isAllowedOrigin } from "@infra/origin";
import { InMemoryRateLimiter } from "@infra/rateLimit";
import {
  isClientMessage,
  type ClientMessage,
  type ServerMessage,
  ERROR_CODES,
  toPublicState,
} from "@domain/protocol";
import {
  MAX_PARTICIPANTS,
  type Participant,
  type RoomSnapshot,
  appendMessage,
  castVote,
  clearMessages,
  clearRoomName,
  countConnected,
  disconnectParticipant,
  findByToken,
  isRemovedToken,
  reclaimDisconnected,
  joinRoom,
  reconnectParticipant,
  removeParticipant,
  resetRound,
  restoreRoom,
  reveal,
  setDeck,
  setParticipantName,
  setRoomName,
  setParticipantRole,
  startNextRound,
  transferOwnership,
} from "@domain/room";

interface SocketIdentity {
  participantId: string | null;
  token: string | null;
}

const ANONYMOUS: SocketIdentity = { participantId: null, token: null };

/** Chat is the only command a socket can fire in a tight loop, so it gets its own budget. */
const CHAT_LIMIT_PER_WINDOW = 5;
const CHAT_WINDOW_MS = 5_000;

/** Everything else a joined participant can ask for. */
const COMMAND_LIMIT_PER_WINDOW = 60;
const COMMAND_WINDOW_MS = 10_000;

/** Joining mints a participant and writes the room, so it gets its own budget. */
const JOIN_LIMIT_PER_WINDOW = 10;
const JOIN_WINDOW_MS = 60_000;

/**
 * Hibernated sockets still cost a full state push on every broadcast, so the
 * fan-out needs a ceiling of its own rather than relying on MAX_PARTICIPANTS.
 */
const MAX_SOCKETS = 80;

export class Room {
  #room: RoomSnapshot | null = null;
  #roomId: string | null = null;
  readonly #chatBudget = new InMemoryRateLimiter(CHAT_LIMIT_PER_WINDOW, CHAT_WINDOW_MS);
  readonly #socketKeys = new WeakMap<WebSocket, string>();
  readonly #joinBudget = new InMemoryRateLimiter(JOIN_LIMIT_PER_WINDOW, JOIN_WINDOW_MS);
  readonly #commandBudget = new InMemoryRateLimiter(
    COMMAND_LIMIT_PER_WINDOW,
    COMMAND_WINDOW_MS,
  );

  constructor(private readonly storage: DurableObjectState) {}

  #currentRoomId(): string {
    this.#roomId ??= this.storage.id.toString();
    return this.#roomId;
  }

  async fetch(request: Request): Promise<Response> {
    const roomId = this.#currentRoomId();
    const url = new URL(request.url);

    if (url.pathname === "/state") {
      return this.#handleRoomState(roomId, request);
    }

    if (url.pathname === "/socket") {
      return this.#upgrade(request);
    }

    return new Response("Not found", { status: 404 });
  }

  #upgrade(request: Request): Response {
    if (!isAllowedOrigin(request)) {
      return new Response("Forbidden", { status: 403 });
    }

    if (this.storage.getWebSockets().length >= MAX_SOCKETS) {
      return new Response("Room is full", { status: 503 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.storage.acceptWebSocket(server);
    server.serializeAttachment(ANONYMOUS);

    return new Response(null, { status: 101, webSocket: client });
  }

  async #handleRoomState(roomId: string, request: Request): Promise<Response> {
    const room = await this.#load(roomId);
    const requestedToken = new URL(request.url).searchParams.get("token");

    return Response.json(toPublicState(room, requestedToken));
  }

  async webSocketMessage(
    socket: WebSocket,
    rawMessage: string | ArrayBuffer,
  ): Promise<void> {
    const parsed = this.#parse(rawMessage);

    if (typeof parsed !== "object" || parsed === null) {
      this.#fail(socket, ERROR_CODES.unauthorized);
      return;
    }

    if (!isClientMessage(parsed)) {
      this.#fail(socket, ERROR_CODES.unauthorized);
      return;
    }

    const message = parsed;
    const messageType = message.type;

    if (messageType === "ping") {
      this.#send(socket, { type: "pong" });
      return;
    }

    if (messageType === "join") {
      if (!this.#joinBudget.allow(this.#socketKey(socket), Date.now())) {
        this.#fail(socket, ERROR_CODES.rateLimited);
        return;
      }
      await this.#handleJoin(socket, message);
      return;
    }

    await this.#handleCommand(socket, message);
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    await this.#handleDeparture(socket);
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.#handleDeparture(socket);
  }

  #parse(rawMessage: string | ArrayBuffer): unknown {
    try {
      return JSON.parse(
        typeof rawMessage === "string" ? rawMessage : new TextDecoder().decode(rawMessage),
      );
    } catch {
      return null;
    }
  }

  async #handleJoin(
    socket: WebSocket,
    message: Extract<ClientMessage, { type: "join" }>,
  ): Promise<void> {
    const validation = validateName(message.name);

    if (!validation.valid) {
      this.#fail(
        socket,
        validation.reason === "empty" ? ERROR_CODES.nameRequired : ERROR_CODES.nameInvalid,
      );
      return;
    }

    let room = await this.#load(this.#currentRoomId());
    const known =
      message.token === null ? undefined : findByToken(room, message.token);

    if (message.token !== null && isRemovedToken(room, message.token)) {
      this.#fail(socket, ERROR_CODES.participantRemoved);
      return;
    }

    if (known !== undefined) {
      const renamed = setParticipantName(room, known.id, validation.name);
      const rerouted = setParticipantRole(renamed, known.id, message.role);
      const back = reconnectParticipant(rerouted, known.id);

      await this.#save(back);
      this.#attach(socket, { participantId: known.id, token: known.token });

      this.#send(socket, {
        type: "joined",
        participantId: known.id,
        token: known.token,
        state: toPublicState(back, known.token),
      });
      this.#broadcast();
      return;
    }

    const withRoom = reclaimDisconnected(room);
    if (withRoom.participants.length >= MAX_PARTICIPANTS) {
      this.#fail(socket, ERROR_CODES.roomFull);
      return;
    }

    room = withRoom;

    const participantId = crypto.randomUUID();
    const token = crypto.randomUUID();

    const draft: Omit<Participant, "vote" | "disconnectedAt"> = {
      id: participantId,
      token,
      name: validation.name,
      role: message.role,
      isOwner: false,
      isConnected: true,
    };

    room = joinRoom(room, draft);
    await this.#save(room);
    this.#attach(socket, { participantId, token });

    this.#send(socket, {
      type: "joined",
      participantId,
      token,
      state: toPublicState(room, token),
    });
    this.#broadcast();
  }

  async #handleCommand(socket: WebSocket, message: ClientMessage): Promise<void> {
    if (!this.#spend(socket, message)) return;

    const identity = this.#identity(socket);

    if (identity === null || identity.token === null) {
      this.#fail(socket, ERROR_CODES.unauthorized);
      return;
    }

    let room = await this.#load(this.#currentRoomId());
    const actor = findByToken(room, identity.token);

    if (actor === undefined) {
      this.#fail(socket, ERROR_CODES.unauthorized);
      return;
    }

    const requiresOwner = OWNER_ONLY_COMMANDS.has(message.type);

    if (requiresOwner && room.ownerId !== actor.id) {
      this.#fail(socket, ERROR_CODES.notOwner);
      return;
    }

    switch (message.type) {
      case "vote": {
        if (!isVoteValue(room.deckId, message.value)) {
          this.#fail(socket, ERROR_CODES.invalidVote);
          return;
        }
        room = castVote(room, actor.id, message.value);
        break;
      }
      case "reveal":
        room = reveal(room);
        break;
      case "next-round":
        room = startNextRound(room);
        break;
      case "reset-round":
        room = resetRound(room);
        break;
      case "set-deck": {
        if (!isDeckId(message.deckId)) {
          this.#fail(socket, ERROR_CODES.invalidVote);
          return;
        }
        room = setDeck(room, message.deckId);
        break;
      }
      case "set-role":
        if (message.role !== "voter" && message.role !== "spectator") {
          this.#fail(socket, ERROR_CODES.unauthorized);
          return;
        }
        room = setParticipantRole(room, message.participantId, message.role);
        break;
      case "set-name": {
        const validation = validateName(message.name);
        if (!validation.valid) {
          this.#fail(
            socket,
            validation.reason === "empty"
              ? ERROR_CODES.nameRequired
              : ERROR_CODES.nameInvalid,
          );
          return;
        }
        room = setParticipantName(room, actor.id, validation.name);
        break;
      }
      case "transfer-ownership":
        room = transferOwnership(room, message.participantId);
        break;
      case "remove-participant": {
        const removed = message.participantId;
        room = removeParticipant(room, removed);
        await this.#save(room);
        this.#broadcast();
        this.#disconnectParticipantSockets(removed);
        return;
      }
      case "chat": {
        const text = normalizeMessageText(message.text);
        if (text.length === 0) {
          this.#fail(socket, ERROR_CODES.emptyMessage);
          return;
        }
        const sent: ChatMessage = {
          id: crypto.randomUUID(),
          authorId: actor.id,
          authorName: actor.name,
          text,
          sentAt: Date.now(),
        };

        await this.#save(appendMessage(room, sent));
        this.#broadcast({ type: "chat", message: sent });
        return;
      }
      case "set-room-name": {
        if (message.name === null) {
          room = clearRoomName(room);
          break;
        }

        const validation = validateSessionName(message.name);
        if (!validation.valid) {
          this.#fail(
            socket,
            validation.reason === "empty"
              ? ERROR_CODES.sessionNameRequired
              : ERROR_CODES.sessionNameInvalid,
          );
          return;
        }

        room = setRoomName(room, validation.name);
        break;
      }
      case "clear-chat":
        room = clearMessages(room);
        break;
      case "delete-room":
        this.#broadcast({ type: "room-deleted" });
        await this.#wipe();
        return;
      default:
        return;
    }

    await this.#save(room);
    this.#broadcast();
  }

  async #handleDeparture(socket: WebSocket): Promise<void> {
    const identity = this.#identity(socket);


    if (identity === null || identity.token === null) {
      return;
    }

    let room = await this.#load(this.#currentRoomId());
    const participant = findByToken(room, identity.token);

    if (participant === undefined) {
      return;
    }

    if (this.#hasOtherSocketFor(identity.token, socket)) {
      return;
    }

    room = disconnectParticipant(room, participant.id);
    await this.#save(room);
    this.#broadcast();

    if (countConnected(room) === 0) {
      await this.#scheduleExpiry();
    }
  }

  #hasOtherSocketFor(token: string, current: WebSocket): boolean {
    return this.storage.getWebSockets().some((socket) => {
      if (socket === current) return false;
      return this.#identity(socket)?.token === token;
    });
  }

  #scheduleExpiry(): Promise<void> {
    const room = this.#room;
    if (room === null) return Promise.resolve();
    return this.storage.storage.setAlarm(Date.now() + room.gracePeriodMs);
  }

  #identity(socket: WebSocket): SocketIdentity | null {
    const attachment = socket.deserializeAttachment() as unknown;
    if (attachment === null || attachment === undefined) return null;
    if (typeof attachment !== "object") return null;
    return attachment as SocketIdentity;
  }

  #attach(socket: WebSocket, identity: SocketIdentity): void {
    socket.serializeAttachment(identity);
  }

  #fail(socket: WebSocket, code: string): void {
    this.#send(socket, { type: "error", code });
  }

  #send(socket: WebSocket, message: ServerMessage): void {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // socket already closed
    }
  }

  /**
   * Removal has to actually remove: the socket is told why and then hung up, so
   * the person stops receiving the room instead of sitting on a closed seat.
   */
  #disconnectParticipantSockets(participantId: string): void {
    for (const socket of this.storage.getWebSockets()) {
      if (this.#identity(socket)?.participantId !== participantId) continue;

      this.#send(socket, { type: "removed" });
      try {
        socket.close(4003, "removed");
      } catch {
        // already gone
      }
    }
  }

  /**
   * Charges one unit of the budget that applies to this command. Chat is bounded
   * tightly because every accepted message costs a durable write and a full state
   * push to every socket in the room.
   */
  #spend(socket: WebSocket, message: ClientMessage): boolean {
    const key = this.#participantKey(socket);
    const budget =
      message.type === "chat" ? this.#chatBudget : this.#commandBudget;
    const now = Date.now();

    if (budget.allow(key, now)) return true;

    this.#fail(socket, ERROR_CODES.rateLimited);
    return false;
  }

  /**
   * Stable identity for a single connection. Join keys on this because each
   * successful join mints a fresh token, so a token keyed budget would reset
   * itself on every attempt and never limit anything.
   */
  #socketKey(socket: WebSocket): string {
    let key = this.#socketKeys.get(socket);
    if (key === undefined) {
      key = crypto.randomUUID();
      this.#socketKeys.set(socket, key);
    }

    return key;
  }

  /**
   * One budget per participant rather than per connection, so opening extra
   * sockets does not buy extra allowance once joined.
   */
  #participantKey(socket: WebSocket): string {
    return this.#identity(socket)?.token ?? this.#socketKey(socket);
  }

  #broadcast(override?: ServerMessage): void {
    const room = this.#room;
    if (override === undefined && room === null) return;

    for (const socket of this.storage.getWebSockets()) {
      if (override !== undefined) {
        this.#send(socket, override);
        continue;
      }

      const token = this.#identity(socket)?.token ?? null;
      this.#send(socket, {
        type: "state",
        state: toPublicState(room as RoomSnapshot, token),
      });
    }
  }

  async #load(roomId: string): Promise<RoomSnapshot> {
    if (this.#room !== null) return this.#room;

    const stored = await this.storage.storage.get<{ room: Partial<RoomSnapshot> }>("room");
    this.#room = restoreRoom(stored?.room, roomId);
    return this.#room;
  }

  #save(room: RoomSnapshot): Promise<void> {
    this.#room = room;
    return this.storage.storage.put("room", { room });
  }

  async #wipe(): Promise<void> {
    this.#room = null;
    await this.storage.storage.delete("room");
  }

  async alarm(): Promise<void> {
    const room = await this.#load(this.#currentRoomId());

    if (countConnected(room) === 0) {
      await this.#wipe();
    }
  }
}

const OWNER_ONLY_COMMANDS = new Set([
  "reveal",
  "next-round",
  "reset-round",
  "set-deck",
  "set-role",
  "transfer-ownership",
  "remove-participant",
  "clear-chat",
  "set-room-name",
  "delete-room",
]);