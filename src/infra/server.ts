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
  disconnectParticipant,
  findByToken,
  isRemovedToken,
  reclaimDisconnected,
  joinRoom,
  reconnectParticipant,
  removeCat,
  removeParticipant,
  resetRound,
  restoreRoom,
  shouldRoomExpire,
  reveal,
  setDeck,
  setParticipantName,
  setRoomName,
  setParticipantRole,
  startNextRound,
  transferOwnership,
} from "@domain/room";
import { CAT_BREEDS, type CatState, spreadAlongTheEdges } from "@domain/cat";

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

// One frame per cat, so the most expensive command in the room gets its own small budget.
const SHOO_LIMIT_PER_WINDOW = 3;
const COMMAND_WINDOW_MS = 10_000;

/**
 * Movement is a stream, not a request. This is only an abuse ceiling to stop one
 * socket flooding the room with broadcasts; a normal client is throttled to about
 * ten updates a second and never approaches it. Frames over the ceiling are
 * dropped silently rather than answered with "Slow down".
 */
const CAT_LIMIT_PER_WINDOW = 6_000;
const CAT_WINDOW_MS = 10_000;

/** Cat positions are cosmetic, so a short durable-write debounce is invisible. */
const CAT_PERSIST_INTERVAL_MS = 2_000;

/**
 * How many rows of cats fit on a screen before a new arrival has to share a row.
 * A room may seat MAX_PARTICIPANTS people, and a seed that simply divides by the
 * number of existing cats walks off the bottom of the viewport once the room is
 * busy: a late arrival's cat is then invisible and, because it cannot be clicked,
 * impossible to take control of. Wrapping the lane keeps every cat somewhere a
 * person can actually reach it.
 */
const CAT_LANES = 8;
const CAT_COLUMNS = 5;

/**
 * Spreads a joining cat over the lanes and columns. The first one sits low and near
 * the edge so the owner sees their own cat arrive without it covering the board.
 */
function seedPosition(index: number): { x: number; y: number } {
  if (index === 0) return { x: 0.12, y: 0.72 };

  return {
    x: ((index % CAT_COLUMNS) + 1) / (CAT_COLUMNS + 1),
    y: ((Math.floor(index / CAT_COLUMNS) % CAT_LANES) + 1) / (CAT_LANES + 1),
  };
}

/** Joining mints a participant and writes the room, so it gets its own budget. */
const JOIN_LIMIT_PER_WINDOW = 10;
const JOIN_WINDOW_MS = 60_000;

/**
 * The public state endpoint is reachable by anyone holding the link and builds the
 * whole room, cats included, on every call. The client never reads it, so there is
 * nothing to tune against: the budget exists to bound what one caller can cost the
 * Durable Object, not to serve a polling client, and the app itself is unaffected.
 */
const STATE_LIMIT_PER_WINDOW = 30;
const STATE_WINDOW_MS = 60_000;

/**
 * Hibernated sockets still cost a full state push on every broadcast, so the
 * fan-out needs a ceiling of its own rather than relying on MAX_PARTICIPANTS.
 */
const MAX_SOCKETS = 80;

/**
 * What a command leaves behind. Most only change the room and let the shared tail write
 * it; a few persist and broadcast on their own, and those have to be able to say so.
 */
interface CommandOutcome {
  room: RoomSnapshot;
  finished: boolean;
}

/** Who is asking and what they are allowed to ask about. */
interface AuthorizedActor {
  room: RoomSnapshot;
  actor: Participant;
}

export class Room {
  #room: RoomSnapshot | null = null;
  #roomId: string | null = null;
  readonly #cats = new Map<string, CatState>();
  readonly #chatBudget = new InMemoryRateLimiter(CHAT_LIMIT_PER_WINDOW, CHAT_WINDOW_MS);
  readonly #socketKeys = new WeakMap<WebSocket, string>();
  readonly #joinBudget = new InMemoryRateLimiter(JOIN_LIMIT_PER_WINDOW, JOIN_WINDOW_MS);
  readonly #commandBudget = new InMemoryRateLimiter(
    COMMAND_LIMIT_PER_WINDOW,
    COMMAND_WINDOW_MS,
  );
  readonly #catBudget = new InMemoryRateLimiter(CAT_LIMIT_PER_WINDOW, CAT_WINDOW_MS);
  readonly #shooBudget = new InMemoryRateLimiter(
    SHOO_LIMIT_PER_WINDOW,
    COMMAND_WINDOW_MS,
  );
  readonly #stateBudget = new InMemoryRateLimiter(STATE_LIMIT_PER_WINDOW, STATE_WINDOW_MS);
  #catsPersistTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  #lastCatsPersistAt = 0;

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
    const now = Date.now();
    // Keyed by caller because the room is shared: without a key one person looping
    // would spend the budget of everyone else standing in the same room.
    const caller = request.headers.get("CF-Connecting-IP") ?? "unknown";

    if (!this.#stateBudget.allow(caller, now)) {
      return new Response("Too many requests", {
        status: 429,
        headers: {
          "Retry-After": String(this.#stateBudget.retryAfterSeconds(caller, now)),
        },
      });
    }

    const room = await this.#load(roomId);
    const requestedToken = new URL(request.url).searchParams.get("token");

    return Response.json(toPublicState(room, requestedToken, this.#catStates(room)));
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
        state: toPublicState(back, known.token, this.#catStates(back)),
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

    const draft: Omit<Participant, "vote" | "disconnectedAt" | "hasCat"> = {
      id: participantId,
      token,
      name: validation.name,
      role: message.role,
      isOwner: false,
      isConnected: true,
    };

    room = joinRoom(room, draft);
    this.#cats.set(participantId, {
      participantId,
      breed: this.#nextBreed(),
      ...seedPosition(this.#cats.size),
      direction: "right",
      activity: "idle",
      isPaused: false,
    });
    await this.#save(room);
    this.#attach(socket, { participantId, token });

    this.#send(socket, {
      type: "joined",
      participantId,
      token,
      state: toPublicState(room, token, this.#catStates(room)),
    });
    this.#broadcast();
  }

  async #handleCommand(socket: WebSocket, message: ClientMessage): Promise<void> {
    if (!this.#spend(socket, message)) return;

    const session = await this.#authorize(socket, message);

    if (session === null) return;

    const outcome = await this.#applyCommand(socket, message, session);

    if (outcome.finished) return;

    await this.#save(outcome.room);
    this.#broadcast();
  }

  /**
   * Who is on the other end of this socket, and whether the command they sent is one only
   * the owner may send. Every rejection is answered with its reason rather than a dropped
   * connection, because someone who renamed themselves by accident is not an intruder and
   * should not be left guessing which one they are.
   */
  async #authorize(
    socket: WebSocket,
    message: ClientMessage,
  ): Promise<AuthorizedActor | null> {
    const identity = this.#identity(socket);

    if (identity?.token == null) {
      this.#fail(socket, ERROR_CODES.unauthorized);
      return null;
    }

    const room = await this.#load(this.#currentRoomId());
    const actor = findByToken(room, identity.token);

    if (actor === undefined) {
      this.#fail(socket, ERROR_CODES.unauthorized);
      return null;
    }

    if (OWNER_ONLY_COMMANDS.has(message.type) && room.ownerId !== actor.id) {
      this.#fail(socket, ERROR_CODES.notOwner);
      return null;
    }

    return { room, actor };
  }

  /**
   * The commands are a table rather than a chain, so each one is matched by name and
   * written out where it can be read on its own.
   */
  async #applyCommand(
    socket: WebSocket,
    message: ClientMessage,
    session: AuthorizedActor,
  ): Promise<CommandOutcome> {
    const { room, actor } = session;

    switch (message.type) {
      case "vote":
        return this.#applyVote(socket, message, room, actor);
      case "set-deck":
        return this.#applyDeck(socket, message, room);
      case "set-role":
        return this.#applyRole(socket, message, room);
      case "set-name":
        return this.#applyName(socket, message, room, actor);
      case "set-room-name":
        return this.#applyRoomName(socket, message, room);
      case "chat":
        return this.#applyChat(socket, message, room, actor);
      case "cat-update":
        return this.#applyCatUpdate(socket, message, room, actor);
      case "reveal":
      case "next-round":
      case "reset-round":
        return { room: this.#advanceRoom(message, room), finished: false };
      case "transfer-ownership":
        return { room: transferOwnership(room, message.participantId), finished: false };
      /**
       * Carried off the socket, so nobody can reach a cat but their own, and the seat is
       * left alone: sending a cat away is not removing a person.
       *
       * The next room is handed back rather than saved here, because a command that saves
       * for itself has to finish, and the caller then writes the room it started from
       * straight back over the change.
       */
      case "remove-cat": {
        this.#cats.delete(actor.id);
        return { room: removeCat(room, actor.id), finished: false };
      }
      case "shoo-cats":
        this.#shooCats(message.aspect);
        return { room, finished: true };
      case "remove-participant": {
        const removed = message.participantId;

        this.#cats.delete(removed);
        await this.#save(removeParticipant(room, removed));
        this.#broadcast();
        this.#disconnectParticipantSockets(removed);

        return { room, finished: true };
      }
      case "delete-room":
        this.#broadcast({ type: "room-deleted" });
        await this.#wipe();
        return { room, finished: true };
      case "clear-chat":
        return { room: clearMessages(room), finished: false };
      default:
        return { room, finished: true };
    }
  }

  #applyCatUpdate(
    socket: WebSocket,
    message: Extract<ClientMessage, { type: "cat-update" }>,
    room: RoomSnapshot,
    actor: Participant,
  ): CommandOutcome {
    const current = this.#cats.get(actor.id);
    if (current === undefined) return { room, finished: true };

    const cat: CatState = {
      ...current,
      x: Math.min(1, Math.max(0, message.x)),
      y: Math.min(1, Math.max(0, message.y)),
      direction: message.direction,
      activity: message.activity,
      isPaused: message.isPaused,
    };

    this.#cats.set(actor.id, cat);
    // Movement is ephemeral: peers get a single small frame rather than a full
    // room push, and the durable write is deferred instead of paid per tick.
    this.#broadcastCatState(cat, socket);
    this.#scheduleCatsPersist();

    return { room, finished: true };
  }

  /**
   * Walks every cat out to the border of the screen the caller is looking at.
   *
   * It is a nudge rather than a rule: an idle cat keeps wandering, so the middle of the
   * room fills up again on its own and the button stays worth having. Being a nudge is
   * the point, because the alternative would be the room deciding where a cat may go
   * and a person deciding where their own cat goes, which is the opposite of a cat.
   *
   * Open to everybody, because a cat sitting on the vote grid is in the way of
   * everyone reading it. What stops it from being a lever is the spread being
   * deterministic and a cat that has not moved being left unannounced: pressing it twice
   * in the same window costs nothing and says nothing.
   */
  #shooCats(aspect: number): void {
    const spots = spreadAlongTheEdges(this.#cats.size, aspect);
    let index = 0;
    let changed = false;

    for (const cat of this.#cats.values()) {
      const spot = spots[index];
      if (spot === undefined) break;

      const alreadyThere =
        cat.x === spot.x && cat.y === spot.y && cat.direction === spot.direction;

      if (alreadyThere) {
        index += 1;
        continue;
      }

      const moved: CatState = {
        ...cat,
        x: spot.x,
        y: spot.y,
        direction: spot.direction,
      };

      this.#cats.set(cat.participantId, moved);
      this.#broadcastCatState(moved);
      changed = true;
      index += 1;
    }

    if (changed) this.#scheduleCatsPersist();
  }

  #advanceRoom(message: ClientMessage, room: RoomSnapshot): RoomSnapshot {
    if (message.type === "reveal") return reveal(room);
    if (message.type === "next-round") return startNextRound(room);
    return resetRound(room);
  }

  #applyVote(
    socket: WebSocket,
    message: Extract<ClientMessage, { type: "vote" }>,
    room: RoomSnapshot,
    actor: Participant,
  ): CommandOutcome {
    if (!isVoteValue(room.deckId, message.value)) {
      this.#fail(socket, ERROR_CODES.invalidVote);
      return { room, finished: true };
    }

    return { room: castVote(room, actor.id, message.value), finished: false };
  }

  #applyDeck(
    socket: WebSocket,
    message: Extract<ClientMessage, { type: "set-deck" }>,
    room: RoomSnapshot,
  ): CommandOutcome {
    if (!isDeckId(message.deckId)) {
      this.#fail(socket, ERROR_CODES.invalidVote);
      return { room, finished: true };
    }

    return { room: setDeck(room, message.deckId), finished: false };
  }

  #applyRole(
    socket: WebSocket,
    message: Extract<ClientMessage, { type: "set-role" }>,
    room: RoomSnapshot,
  ): CommandOutcome {
    if (message.role !== "voter" && message.role !== "spectator") {
      this.#fail(socket, ERROR_CODES.unauthorized);
      return { room, finished: true };
    }

    return { room: setParticipantRole(room, message.participantId, message.role), finished: false };
  }

  #applyName(
    socket: WebSocket,
    message: Extract<ClientMessage, { type: "set-name" }>,
    room: RoomSnapshot,
    actor: Participant,
  ): CommandOutcome {
    const validation = validateName(message.name);

    if (!validation.valid) {
      this.#fail(
        socket,
        validation.reason === "empty" ? ERROR_CODES.nameRequired : ERROR_CODES.nameInvalid,
      );
      return { room, finished: true };
    }

    return { room: setParticipantName(room, actor.id, validation.name), finished: false };
  }

  #applyRoomName(
    socket: WebSocket,
    message: Extract<ClientMessage, { type: "set-room-name" }>,
    room: RoomSnapshot,
  ): CommandOutcome {
    if (message.name === null) {
      return { room: clearRoomName(room), finished: false };
    }

    const validation = validateSessionName(message.name);

    if (!validation.valid) {
      this.#fail(
        socket,
        validation.reason === "empty"
          ? ERROR_CODES.sessionNameRequired
          : ERROR_CODES.sessionNameInvalid,
      );
      return { room, finished: true };
    }

    return { room: setRoomName(room, validation.name), finished: false };
  }

  async #applyChat(
    socket: WebSocket,
    message: Extract<ClientMessage, { type: "chat" }>,
    room: RoomSnapshot,
    actor: Participant,
  ): Promise<CommandOutcome> {
    const text = normalizeMessageText(message.text);

    if (text.length === 0) {
      this.#fail(socket, ERROR_CODES.emptyMessage);
      return { room, finished: true };
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

    return { room, finished: true };
  }

  async #handleDeparture(socket: WebSocket): Promise<void> {
    const identity = this.#identity(socket);


    if (identity?.token == null) {
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
    // The cat stays in the map across a disconnect so a refresh comes back to the
    // same breed and pose; #catStates only publishes cats whose owner is connected.
    await this.#save(room);
    this.#broadcast();

    await this.#scheduleReclaim();
  }

  #hasOtherSocketFor(token: string, current: WebSocket): boolean {
    return this.storage.getWebSockets().some((socket) => {
      if (socket === current) return false;
      return this.#identity(socket)?.token === token;
    });
  }

  /**
   * Aimed at the earliest deadline rather than at the clock, which made a seat whose
   * window had already elapsed wait another whole grace period for somebody to look.
   * Armed for nothing while nobody is away: a wake to find no deadline is a wake for
   * no reason.
   */
  #scheduleReclaim(): Promise<void> {
    const room = this.#room;
    if (room === null) return Promise.resolve();

    const deadlines: number[] = [];

    for (const participant of room.participants) {
      if (participant.isConnected || participant.disconnectedAt === null) continue;
      deadlines.push(participant.disconnectedAt + room.gracePeriodMs);
    }

    if (deadlines.length === 0) return Promise.resolve();

    return this.storage.storage.setAlarm(Math.min(...deadlines));
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
    let budget = this.#commandBudget;
    if (message.type === "chat") budget = this.#chatBudget;
    if (message.type === "cat-update") budget = this.#catBudget;
    if (message.type === "shoo-cats") budget = this.#shooBudget;
    const now = Date.now();

    if (budget.allow(key, now)) return true;

    // Movement frames are dropped without an error so a flood can never freeze a
    // cat behind "Slow down"; real commands still get the rate-limit answer.
    if (message.type === "cat-update") return false;

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

  #nextBreed(): CatState["breed"] {
    const used = new Set([...this.#cats.values()].map((cat) => cat.breed));
    return CAT_BREEDS.find((breed) => !used.has(breed)) ?? CAT_BREEDS[this.#cats.size % CAT_BREEDS.length] ?? "tabby";
  }

  #catStates(room: RoomSnapshot): CatState[] {
    const connected = new Set(
      room.participants.filter((participant) => participant.isConnected).map((participant) => participant.id),
    );
    return [...this.#cats.values()].filter((cat) => connected.has(cat.participantId));
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
        state: toPublicState(room as RoomSnapshot, token, this.#catStates(room as RoomSnapshot)),
      });
    }
  }

  /**
   * Movement reaches the other sockets as one small frame instead of a full room
   * push, which is what makes frequent updates affordable. The sender is skipped
   * because it already has the position it just reported.
   */
  // The owner is skipped because they already know where their cat is, except on a shoo,
  // which moves cats nobody moved and would otherwise leave the presser uninformed.
  #broadcastCatState(cat: CatState, exceptSocket: WebSocket | null = null): void {
    for (const socket of this.storage.getWebSockets()) {
      if (socket === exceptSocket) continue;
      this.#send(socket, { type: "cat-state", cat });
    }
  }

  /**
   * Cat positions are cosmetic, so writing them to storage is debounced rather
   * than paid on every movement tick. Joins and departures save immediately, so
   * the deferred write only ever trails the last couple of seconds of motion.
   */
  #scheduleCatsPersist(): void {
    if (this.#catsPersistTimer !== null) return;

    const elapsed = Date.now() - this.#lastCatsPersistAt;
    const delay = Math.max(0, CAT_PERSIST_INTERVAL_MS - elapsed);

    this.#catsPersistTimer = globalThis.setTimeout(() => {
      this.#catsPersistTimer = null;
      this.#lastCatsPersistAt = Date.now();
      void this.storage.storage.put("cats", [...this.#cats.values()]);
    }, delay);
  }

  async #load(roomId: string): Promise<RoomSnapshot> {
    if (this.#room !== null) return this.#room;

    // One read rather than two: a cold start happens on every wake, including the
    // one an expiry alarm causes, so the round trip is not a cost paid rarely. The
    // storage types answer every key with one value type, hence the narrowing.
    const stored = await this.storage.storage.get(["room", "cats"]);
    const storedCats = stored.get("cats") as CatState[] | undefined;
    for (const cat of storedCats ?? []) this.#cats.set(cat.participantId, cat);
    const storedRoom = stored.get("room") as { room: Partial<RoomSnapshot> } | undefined;
    this.#room = restoreRoom(storedRoom?.room, roomId);
    return this.#room;
  }

  #save(room: RoomSnapshot): Promise<void> {
    this.#room = room;
    this.#pruneCats(room);
    return Promise.all([
      this.storage.storage.put("room", { room }),
      this.storage.storage.put("cats", [...this.#cats.values()]),
    ]).then(() => undefined);
  }

  /**
   * A cat lives exactly as long as the room still says it does. Two things end it:
   * the seat going away, and the owner sending it off, which keeps the seat. Both
   * have to be honoured here rather than only in the map, because the map is
   * serialised on every save and outlives the write that emptied it, so a stale entry
   * makes every vote, rename and chat message in the room pay for a cat that should
   * not be there, and puts it back on the screen the next time the room loads.
   *
   * A departure on its own is still not grounds for pruning: the participant is still
   * seated and a refresh should find the same breed and pose waiting.
   */
  #pruneCats(room: RoomSnapshot): void {
    const stillOnScreen = new Map(
      room.participants.map((participant) => [participant.id, participant.hasCat]),
    );

    for (const participantId of this.#cats.keys()) {
      // A cat whose seat is taken but whose owner sent it away is pruned on purpose.
      // Seated is not enough on its own: the cats map outlives the write that removed
      // the entry, and a pruner that only asked whether the seat was still taken would
      // carry a stale cat straight back onto the screen the next time the room loads.
      if (stillOnScreen.get(participantId) !== true) this.#cats.delete(participantId);
    }
  }

  async #wipe(): Promise<void> {
    // The deferred write is cancelled with the room, not left to land afterwards
    // and put a cats key back into storage for a room that no longer exists.
    this.#cancelCatsPersist();
    this.#room = null;
    this.#cats.clear();
    await this.storage.storage.delete("room");
    await this.storage.storage.delete("cats");
  }

  #cancelCatsPersist(): void {
    if (this.#catsPersistTimer === null) return;

    globalThis.clearTimeout(this.#catsPersistTimer);
    this.#catsPersistTimer = null;
  }

  /**
   * Two different jobs land on the same alarm. A room nobody is in any more is finished
   * and goes. A room that still has people in it may have seats held by somebody who
   * is never coming back, and those are freed here and the room is told, because a list
   * still carrying somebody who left an hour ago is not a record of the room.
   */
  async alarm(): Promise<void> {
    const room = await this.#load(this.#currentRoomId());

    if (shouldRoomExpire(room)) {
      await this.#wipe();
      return;
    }

    const reclaimed = reclaimDisconnected(room);

    if (reclaimed !== room) {
      // #save also prunes the cats of anybody whose seat just went, so a reclaimed
      // seat does not leave a cat standing in the room with nobody behind it.
      await this.#save(reclaimed);
      this.#broadcast();
    }

    await this.#scheduleReclaim();
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
