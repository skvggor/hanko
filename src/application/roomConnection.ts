import {
  type ClientMessage,
  type PublicRoomState,
  type ServerMessage,
  isServerMessage,
} from "@domain/protocol";
import type { ChatMessage } from "@domain/chat";
import type { DeckId } from "@domain/deck";
import type { ParticipantRole } from "@domain/room";

export type SocketFactory = (url: string) => WebSocket;

type StateListener = (state: PublicRoomState) => void;
type ErrorListener = (code: string) => void;
type DeletedListener = () => void;
type ChatListener = (message: ChatMessage) => void;
type RemovedListener = () => void;
type ConnectionListener = (connected: boolean) => void;

export function createDefaultSocketFactory(): SocketFactory {
  return (url) => new WebSocket(url);
}

export class RoomConnection {
  #socket: WebSocket | null = null;
  #stateListeners = new Set<StateListener>();
  #errorListeners = new Set<ErrorListener>();
  #deletedListeners = new Set<DeletedListener>();
  #chatListeners = new Set<ChatListener>();
  #removedListeners = new Set<RemovedListener>();
  #connectionListeners = new Set<ConnectionListener>();

  #participantId: string | null = null;
  #token: string | null = null;
  #open = false;
  #removed = false;

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
    const socket = this.socketFactory(this.buildSocketUrl());

    this.#socket = socket;

    socket.onopen = () => {
      this.#open = true;
      this.#notifyConnection();
    };

    socket.onmessage = (event: MessageEvent) => {
      this.#handleMessage(event.data);
    };

    socket.onclose = () => {
      this.#open = false;
      this.#notifyConnection();
    };

    socket.onerror = () => {
      this.#open = false;
      this.#notifyConnection();
    };

    await this.#waitForOpen(socket);
    this.#send({ type: "join", token, name, role });
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
        for (const listener of this.#removedListeners) listener();
        break;
      case "room-deleted":
        for (const listener of this.#deletedListeners) listener();
        break;
      case "pong":
        break;
    }
  }

  #emitState(state: PublicRoomState): void {
    for (const listener of this.#stateListeners) listener(state);
  }

  #notifyConnection(): void {
    for (const listener of this.#connectionListeners) listener(this.#open);
  }

  #waitForOpen(socket: WebSocket): Promise<void> {
    if (socket.readyState === 1) return Promise.resolve();

    return new Promise((resolve) => {
      const opened = () => resolve();
      socket.addEventListener("open", opened, { once: true });
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

  close(): void {
    this.#socket?.close();
    this.#open = false;
  }
}