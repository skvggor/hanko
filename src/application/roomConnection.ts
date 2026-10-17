import {
  type ClientMessage,
  type PublicRoomState,
  type ServerMessage,
  isServerMessage,
} from "@domain/protocol";
import type { ChatMessage } from "@domain/chat";
import type { DeckId } from "@domain/deck";
import type { ParticipantRole } from "@domain/room";
import type { CatActivity, CatExclusionZone, CatState } from "@domain/cat";

export type SocketFactory = (url: string) => WebSocket;

/**
 * Whether the room is reachable, still being chased, or gone. A plain boolean
 * cannot say "we are still trying", which is the difference between a person
 * waiting and a person who has been silently dropped.
 */
export type ConnectionStatus = "connected" | "reconnecting" | "offline";

type StateListener = (state: PublicRoomState) => void;
type ErrorListener = (code: string) => void;
type DeletedListener = () => void;
type ChatListener = (message: ChatMessage) => void;
type CatStateListener = (cat: CatState) => void;
type RemovedListener = () => void;
type ConnectionListener = (status: ConnectionStatus) => void;

export function createDefaultSocketFactory(): SocketFactory {
  return (url) => new WebSocket(url);
}

/**
 * How long to wait before each retry. The room is worth chasing through a tunnel
 * or a lift, so the schedule stretches rather than giving up quickly, and it stops
 * after a little over a minute of continuous failure: past that the person is
 * better served by being told the connection is gone than by watching a spinner
 * that has already lost. The token reopens the same seat, so a reconnect costs
 * nothing but the round trip.
 */
const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000, 15_000, 30_000] as const;

/**
 * Cat movement is a stream rather than a discrete command, so it is throttled on
 * the client instead of relying on the server budget alone.
 */
const CAT_UPDATE_INTERVAL_MS = 100;

export class RoomConnection {
  #socket: WebSocket | null = null;
  readonly #stateListeners = new Set<StateListener>();
  readonly #errorListeners = new Set<ErrorListener>();
  readonly #deletedListeners = new Set<DeletedListener>();
  readonly #chatListeners = new Set<ChatListener>();
  readonly #catStateListeners = new Set<CatStateListener>();
  readonly #removedListeners = new Set<RemovedListener>();
  readonly #connectionListeners = new Set<ConnectionListener>();

  #participantId: string | null = null;
  #token: string | null = null;
  #open = false;
  #removed = false;
  #deleted = false;
  /** Set only by close(), so a deliberate leave never turns into a reconnect. */
  #closed = false;
  #joinName: string | null = null;
  #joinRole: ParticipantRole = "voter";
  #joinToken: string | null = null;
  #reconnectAttempt = 0;
  #reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  #pendingCatUpdate: {
    x: number;
    y: number;
    direction: "left" | "right";
    activity: CatActivity;
    isPaused: boolean;
  } | null = null;
  #catUpdateTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  #lastCatUpdateAt = 0;

  constructor(
    private readonly roomId: string,
    private readonly socketFactory: SocketFactory = createDefaultSocketFactory(),
  ) {}

  get participantId(): string | null {
    return this.#participantId;
  }

  get token(): string | null {
    return this.#token;
  }

  protocol(): string {
    return globalThis.location?.protocol === "https:" ? "wss:" : "ws:";
  }

  buildSocketUrl(): string {
    const host = globalThis.location?.host ?? "localhost:5173";
    return `${this.protocol()}//${host}/api/room/${this.roomId}/socket`;
  }

  isConnected(): boolean {
    return this.#open;
  }

  subscribe(listener: StateListener): () => void {
    this.#stateListeners.add(listener);
    return () => {
      this.#stateListeners.delete(listener);
    };
  }

  onError(listener: ErrorListener): () => void {
    this.#errorListeners.add(listener);
    return () => {
      this.#errorListeners.delete(listener);
    };
  }

  /**
   * Chat arrives on its own frame so that speaking never forces a fresh
   * PublicRoomState onto every client, which would re-render the whole board.
   */
  onChatMessage(listener: ChatListener): () => void {
    this.#chatListeners.add(listener);
    return () => {
      this.#chatListeners.delete(listener);
    };
  }

  /**
   * Movement arrives on its own frame so a cat crossing the screen never forces a
   * fresh PublicRoomState, and each peer only patches the one cat that moved.
   */
  onCatState(listener: CatStateListener): () => void {
    this.#catStateListeners.add(listener);
    return () => {
      this.#catStateListeners.delete(listener);
    };
  }

  onRemoved(listener: RemovedListener): () => void {
    this.#removedListeners.add(listener);
    return () => {
      this.#removedListeners.delete(listener);
    };
  }

  onDeleted(listener: DeletedListener): () => void {
    this.#deletedListeners.add(listener);
    return () => {
      this.#deletedListeners.delete(listener);
    };
  }

  onConnectionChange(listener: ConnectionListener): () => void {
    this.#connectionListeners.add(listener);
    return () => {
      this.#connectionListeners.delete(listener);
    };
  }

  async join(
    name: string,
    role: ParticipantRole,
    token: string | null,
  ): Promise<void> {
    this.#joinName = name;
    this.#joinRole = role;
    this.#joinToken = token;
    this.#closed = false;
    this.#reconnectAttempt = 0;
    await this.#openSocket(name, role, token);
  }

  /**
   * One connection attempt. It reports whether the socket actually opened, because
   * a failed attempt must schedule the next one rather than queue a join frame on a
   * socket that will never carry it.
   */
  async #openSocket(
    name: string,
    role: ParticipantRole,
    token: string | null,
  ): Promise<boolean> {
    const socket = this.socketFactory(this.buildSocketUrl());

    this.#socket = socket;

    socket.onopen = () => {
      this.#open = true;
      this.#reconnectAttempt = 0;
      this.#setStatus("connected");
    };

    socket.onmessage = (event: MessageEvent) => {
      this.#handleMessage(event.data);
    };

    socket.onclose = () => {
      this.#handleDrop();
    };

    socket.onerror = () => {
      this.#handleDrop();
    };

    const opened = await this.#waitForOpen(socket);
    if (!opened) return false;

    this.#send({ type: "join", token, name, role });
    return true;
  }

  #handleDrop(): void {
    this.#open = false;
    this.#setStatus("reconnecting");
    this.#scheduleReconnect();
  }

  /**
   * A dropped socket is not a lost seat. The room keeps the seat for the whole
   * grace window, so the only thing a drop actually costs is the connection, and
   * the honest response is to open it again rather than leave the person staring
   * at a frozen board wondering whether their vote survived.
   */
  #scheduleReconnect(): void {
    if (this.#closed || this.#removed || this.#deleted) return;
    if (this.#joinName === null) return;
    if (this.#reconnectTimer !== null) return;

    const delay = RECONNECT_DELAYS_MS[this.#reconnectAttempt];

    if (delay === undefined) {
      this.#setStatus("offline");
      return;
    }

    this.#reconnectAttempt += 1;
    this.#reconnectTimer = globalThis.setTimeout(() => {
      this.#reconnectTimer = null;
      void this.#attemptReconnect();
    }, delay);
  }

  async #attemptReconnect(): Promise<void> {
    const name = this.#joinName;
    if (name === null) return;

    // The issued token is what proves the seat is still ours; the one read from
    // storage only covers a join that never got as far as being answered.
    const token = this.#token ?? this.#joinToken;
    const opened = await this.#openSocket(name, this.#joinRole, token);

    if (!opened) this.#scheduleReconnect();
  }

  /**
   * Starts the chase over from the shortest delay, for a person who has read the
   * message and wants the room back now rather than after another backoff.
   */
  retry(): void {
    if (this.#reconnectTimer !== null) return;

    this.#reconnectAttempt = 0;
    void this.#attemptReconnect();
  }

  #handleMessage(rawData: unknown): void {
    if (typeof rawData !== "string") return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      return;
    }

    if (!isServerMessage(parsed)) return;

    const message: ServerMessage = parsed;

    if (this.#removed) return;

    switch (message.type) {
      case "state":
        this.#emitState(message.state);
        break;
      case "chat":
        for (const listener of this.#chatListeners) listener(message.message);
        break;
      case "cat-state":
        for (const listener of this.#catStateListeners) listener(message.cat);
        break;
      case "joined":
        this.#participantId = message.participantId;
        this.#token = message.token;
        this.#emitState(message.state);
        break;
      case "error":
        for (const listener of this.#errorListeners) listener(message.code);
        break;
      case "removed":
        this.#removed = true;
        this.#cancelReconnect();
        for (const listener of this.#removedListeners) listener();
        break;
      case "room-deleted":
        this.#deleted = true;
        this.#cancelReconnect();
        for (const listener of this.#deletedListeners) listener();
        break;
      case "pong":
        break;
    }
  }

  #emitState(state: PublicRoomState): void {
    for (const listener of this.#stateListeners) listener(state);
  }

  #setStatus(status: ConnectionStatus): void {
    for (const listener of this.#connectionListeners) listener(status);
  }

  /**
   * Resolves true once the socket is usable and false when it dies first. Waiting
   * only for open would strand the attempt forever on a connection that never
   * establishes, which is exactly the case a retry loop exists to survive.
   */
  #waitForOpen(socket: WebSocket): Promise<boolean> {
    if (socket.readyState === 1) return Promise.resolve(true);

    return new Promise((resolve) => {
      const settle = (opened: boolean) => {
        socket.removeEventListener("open", opened0);
        socket.removeEventListener("error", failed);
        socket.removeEventListener("close", failed);
        resolve(opened);
      };
      const opened0 = () => settle(true);
      const failed = () => settle(false);

      socket.addEventListener("open", opened0, { once: true });
      socket.addEventListener("error", failed, { once: true });
      socket.addEventListener("close", failed, { once: true });
    });
  }

  #send(message: ClientMessage): void {
    this.#socket?.send(JSON.stringify(message));
  }

  vote(value: string): void {
    this.#send({ type: "vote", value });
  }

  reveal(): void {
    this.#send({ type: "reveal" });
  }

  nextRound(): void {
    this.#send({ type: "next-round" });
  }

  resetRound(): void {
    this.#send({ type: "reset-round" });
  }

  setDeck(deckId: DeckId): void {
    this.#send({ type: "set-deck", deckId });
  }

  setRole(participantId: string, role: ParticipantRole): void {
    this.#send({ type: "set-role", participantId, role });
  }

  rename(name: string): void {
    this.#send({ type: "set-name", name });
  }

  transferOwnership(participantId: string): void {
    this.#send({ type: "transfer-ownership", participantId });
  }

  removeParticipant(participantId: string): void {
    this.#send({ type: "remove-participant", participantId });
  }

  /** Sent without an id: the server reads who is asking off the socket, so there is no field to fill in with somebody else's name. */
  removeCat(): void {
    this.#send({ type: "remove-cat" });
  }

  /** Carries this window's shape and occupied layout areas, because the room has never seen this screen. */
  shooCats(aspect: number, exclusionZones: CatExclusionZone[] = []): void {
    this.#send({ type: "shoo-cats", aspect, exclusionZones });
  }

  setRoomName(name: string | null): void {
    this.#send({ type: "set-room-name", name });
  }

  sendMessage(text: string): void {
    this.#send({ type: "chat", text });
  }

  clearMessages(): void {
    this.#send({ type: "clear-chat" });
  }

  deleteRoom(): void {
    this.#send({ type: "delete-room" });
  }

  ping(): void {
    this.#send({ type: "ping" });
  }

  /**
   * Cat movement fires far more often than any other command, so the client sends
   * at most one update every CAT_UPDATE_INTERVAL_MS and coalesces the rest into the
   * latest state. Without this a held arrow key produces a burst that trips the
   * server's rate limit before the room can respond to anything else.
   */
  updateCat(
    x: number,
    y: number,
    direction: "left" | "right",
    activity: CatActivity,
    isPaused: boolean,
  ): void {
    this.#pendingCatUpdate = { x, y, direction, activity, isPaused };
    if (this.#catUpdateTimer !== null) return;

    const elapsed = Date.now() - this.#lastCatUpdateAt;
    const delay = Math.max(0, CAT_UPDATE_INTERVAL_MS - elapsed);

    this.#catUpdateTimer = globalThis.setTimeout(() => {
      this.#catUpdateTimer = null;
      this.#flushCatUpdate();
    }, delay);
  }

  #flushCatUpdate(): void {
    const update = this.#pendingCatUpdate;
    if (update === null) return;

    this.#pendingCatUpdate = null;
    this.#lastCatUpdateAt = Date.now();
    this.#send({ type: "cat-update", ...update });
  }

  #cancelReconnect(): void {
    if (this.#reconnectTimer === null) return;

    globalThis.clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
  }

  close(): void {
    // Unmounting is a decision, not a network fault, so the chase has to stop here
    // or it would keep opening sockets for a room nobody is looking at.
    this.#closed = true;
    this.#cancelReconnect();
    if (this.#catUpdateTimer !== null) {
      globalThis.clearTimeout(this.#catUpdateTimer);
      this.#catUpdateTimer = null;
    }
    this.#pendingCatUpdate = null;
    this.#socket?.close();
    this.#open = false;
  }
}
