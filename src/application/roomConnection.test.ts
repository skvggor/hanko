import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicRoomState } from "@domain/protocol";

type Listener = (state: PublicRoomState) => void;

interface FakeWebSocket {
  sent: string[];
  readyState: number;
  close(): void;
  send(payload: string): void;
  onopen: ((event: Event) => void) | null;
  addEventListener(type: string, listener: () => void): void;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

const OPEN = 1;

function createFakeSocket(): FakeWebSocket {
  return {
    sent: [],
    readyState: 1,
    close() {
      this.readyState = 3;
      this.onclose?.();
    },
    send(payload: string) {
      this.sent.push(payload);
    },
    onopen: null,
    addEventListener() {},
    onmessage: null,
    onclose: null,
    onerror: null,
  };
}

function useSecureLocation(): void {
  vi.stubGlobal("location", {
    protocol: "https:",
    host: "hanko.pages.dev",
    href: "https://hanko.pages.dev/room/abc12345",
  });
}

const baseState: PublicRoomState = {
  id: "room-1",
  deckId: "fibonacci",
  round: 1,
  isRevealed: false,
  participants: [],
  ownerId: null,
  gracePeriodMs: 300_000,
  connectedCount: 0,
  reveals: null,
  totalPoints: null,
  myVote: null,
  messages: [],
  name: null,
};

beforeEach(() => {
  useSecureLocation();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RoomConnection", () => {
  it("connects lazily and joins on demand", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();
    const factory = vi.fn(() => socket as unknown as WebSocket);

    const connection = new RoomConnection("room-1", factory);
    await connection.join("Ana", "voter", null);

    expect(factory).toHaveBeenCalledWith(
      expect.stringContaining("/api/room/room-1/socket"),
    );
    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0]!)).toEqual({
      type: "join",
      token: null,
      name: "Ana",
      role: "voter",
    });
  });

  it("builds the socket url from the room id and protocol", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const connection = new RoomConnection("abc12345", vi.fn());

    const url = new URL(connection.buildSocketUrl());

    expect(url.pathname).toBe("/api/room/abc12345/socket");
    expect(url.protocol).toBe("wss:");
    expect(url.host).toBe("hanko.pages.dev");
  });

  it("uses an insecure protocol on a local page", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    vi.stubGlobal("location", { protocol: "http:", host: "localhost:5173" });

    expect(new RoomConnection("r", vi.fn()).protocol()).toBe("ws:");
  });

  it("uses a secure protocol on a secure page", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    expect(new RoomConnection("r", vi.fn()).protocol()).toBe("wss:");
  });

  it("falls back to localhost when there is no location", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    vi.stubGlobal("location", undefined);

    const connection = new RoomConnection("abc12345", vi.fn());
    expect(connection.buildSocketUrl()).toBe(
      "ws://localhost:5173/api/room/abc12345/socket",
    );
  });

  it("emits the joined state to the listener", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();
    const state = baseState;

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    const listener = vi.fn<Listener>();
    connection.subscribe(listener);

    await connection.join("Ana", "voter", null);
    socket.onmessage?.({
      data: JSON.stringify({
        type: "joined",
        participantId: "p1",
        token: "t1",
        state,
      }),
    });

    expect(listener).toHaveBeenCalledWith(state);
    expect(connection.token).toBe("t1");
    expect(connection.participantId).toBe("p1");
  });

  it("emits broadcast state updates", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    const listener = vi.fn<Listener>();
    connection.subscribe(listener);

    await connection.join("Ana", "voter", null);
    socket.onmessage?.({
      data: JSON.stringify({
        type: "state",
        state: { ...baseState, round: 2, isRevealed: true },
      }),
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ round: 2, isRevealed: true }),
    );
  });

  it("ignores malformed frames", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    const listener = vi.fn<Listener>();
    connection.subscribe(listener);

    await connection.join("Ana", "voter", null);
    socket.onmessage?.({ data: "{broken" });
    socket.onmessage?.({ data: JSON.stringify({ type: "state" }) });
    socket.onmessage?.({
      data: JSON.stringify({ type: "joined", participantId: 1, token: null }),
    });
    socket.onmessage?.({ data: JSON.stringify({ type: "error" }) });
    socket.onmessage?.({ data: 42 as unknown as string });

    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps the connection listener in sync", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    const changes = vi.fn<(connected: boolean) => void>();
    connection.onConnectionChange(changes);

    await connection.join("Ana", "voter", null);
    socket.onopen?.(new Event("open"));
    socket.onclose?.();

    expect(changes).toHaveBeenNthCalledWith(1, true);
    expect(changes).toHaveBeenNthCalledWith(2, false);
  });

  it("marks itself disconnected on a socket error", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    await connection.join("Ana", "voter", null);

    socket.readyState = 3;
    socket.onerror?.();

    expect(connection.isConnected()).toBe(false);
  });

  it("unsubscribes a connection listener", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    const changes = vi.fn<(connected: boolean) => void>();
    connection.onConnectionChange(changes)();

    await connection.join("Ana", "voter", null);
    socket.onclose?.();

    expect(changes).not.toHaveBeenCalled();
  });

  it("unsubscribes an error listener", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    const onError = vi.fn();
    connection.onError(onError)();

    await connection.join("Ana", "voter", null);
    socket.onmessage?.({ data: JSON.stringify({ type: "error", code: "not_owner" }) });

    expect(onError).not.toHaveBeenCalled();
  });

  it("unsubscribes a deleted listener", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    const onDeleted = vi.fn();
    connection.onDeleted(onDeleted)();

    await connection.join("Ana", "voter", null);
    socket.onmessage?.({ data: JSON.stringify({ type: "room-deleted" }) });

    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("ignores pong frames", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    const listener = vi.fn<Listener>();
    connection.subscribe(listener);

    await connection.join("Ana", "voter", null);
    expect(() => socket.onmessage?.({ data: JSON.stringify({ type: "pong" }) })).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it("surfaces server errors", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    const onError = vi.fn();
    connection.onError(onError);

    await connection.join("Ana", "voter", null);
    socket.onmessage?.({
      data: JSON.stringify({ type: "error", code: "not_owner" }),
    });

    expect(onError).toHaveBeenCalledWith("not_owner");
  });

  it("unsubscribes a listener", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    const listener = vi.fn<Listener>();
    const unsubscribe = connection.subscribe(listener);
    unsubscribe();

    await connection.join("Ana", "voter", null);
    socket.onmessage?.({
      data: JSON.stringify({ type: "state", state: { id: "room-1" } }),
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("sends commands as json", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    await connection.join("Ana", "voter", null);

    connection.vote("8");
    connection.reveal();
    connection.nextRound();
    connection.resetRound();
    connection.setDeck("linear");
    connection.setRole("p2", "spectator");
    connection.rename("Ana Maria");
    connection.transferOwnership("p2");
    connection.removeParticipant("p2");

    const sent = socket.sent.slice(1).map((entry) => JSON.parse(entry));
    expect(sent).toEqual([
      { type: "vote", value: "8" },
      { type: "reveal" },
      { type: "next-round" },
      { type: "reset-round" },
      { type: "set-deck", deckId: "linear" },
      { type: "set-role", participantId: "p2", role: "spectator" },
      { type: "set-name", name: "Ana Maria" },
      { type: "transfer-ownership", participantId: "p2" },
      { type: "remove-participant", participantId: "p2" },
    ]);
  });

  it("sends a chat message and a clear", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    await connection.join("Ana", "voter", null);
    connection.sendMessage("oi");
    connection.clearMessages();

    expect(socket.sent.slice(1).map((entry) => JSON.parse(entry))).toEqual([
      { type: "chat", text: "oi" },
      { type: "clear-chat" },
    ]);
  });

  it("sends the session name and a reset", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    await connection.join("Ana", "voter", null);
    connection.setRoomName("Sprint 42");
    connection.setRoomName(null);

    expect(socket.sent.slice(1).map((entry) => JSON.parse(entry))).toEqual([
      { type: "set-room-name", name: "Sprint 42" },
      { type: "set-room-name", name: null },
    ]);
  });

  it("signals that the owner removed you", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();
    const listener = vi.fn<() => void>();
    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);

    connection.onRemoved(listener);
    await connection.join("Ana", "voter", null);
    socket.onmessage?.({ data: JSON.stringify({ type: "removed" }) });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ignores every frame once removed", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();
    const onState = vi.fn();
    const onChat = vi.fn();
    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);

    connection.subscribe(onState);
    connection.onChatMessage(onChat);
    await connection.join("Ana", "voter", null);
    socket.onmessage?.({ data: JSON.stringify({ type: "removed" }) });

    socket.onmessage?.({ data: JSON.stringify({ type: "state", state: { id: "room-1" } }) });
    socket.onmessage?.({ data: JSON.stringify({
      type: "chat",
      message: { id: "m1", authorId: "p2", authorName: "Bia", text: "oi", sentAt: 1 },
    }) });

    expect(onState).not.toHaveBeenCalled();
    expect(onChat).not.toHaveBeenCalled();
  });

  it("delivers a chat message on its own frame", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();
    const listener = vi.fn<(message: unknown) => void>();
    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);

    connection.onChatMessage(listener);
    await connection.join("Ana", "voter", null);
    socket.onmessage?.({ data: JSON.stringify({
      type: "chat",
      message: { id: "m1", authorId: "p2", authorName: "Bia", text: "oi", sentAt: 1 },
    }) });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ text: "oi" }),
    );
  });

  it("deletes the room command", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    await connection.join("Ana", "voter", null);
    connection.deleteRoom();

    expect(JSON.parse(socket.sent[1]!)).toEqual({ type: "delete-room" });
  });

  it("signals that the room was deleted", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    const onDeleted = vi.fn();
    connection.onDeleted(onDeleted);

    await connection.join("Ana", "voter", null);
    socket.onmessage?.({ data: JSON.stringify({ type: "room-deleted" }) });

    expect(onDeleted).toHaveBeenCalled();
  });

  it("does not send before joining", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    connection.vote("8");

    expect(socket.sent).toHaveLength(0);
  });

  it("keeps the token across rejoins", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    await connection.join("Ana", "voter", "t1");

    expect(JSON.parse(socket.sent[0]!)).toEqual({
      type: "join",
      token: "t1",
      name: "Ana",
      role: "voter",
    });
  });

  it("sends a ping on demand", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    await connection.join("Ana", "voter", null);
    connection.ping();

    expect(JSON.parse(socket.sent[1]!)).toEqual({ type: "ping" });
  });

  it("marks itself disconnected when the socket closes", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    await connection.join("Ana", "voter", null);
    socket.onclose?.();

    expect(connection.isConnected()).toBe(false);
  });

  it("marks itself connected when the socket opens", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    await connection.join("Ana", "voter", null);

    socket.readyState = OPEN;
    socket.onopen?.(new Event("open"));

    expect(connection.isConnected()).toBe(true);
  });

  it("closes the socket on request", async () => {
    const { RoomConnection } = await import("@application/roomConnection");
    const socket = createFakeSocket();

    const connection = new RoomConnection("room-1", () => socket as unknown as WebSocket);
    await connection.join("Ana", "voter", null);
    connection.close();

    expect(connection.isConnected()).toBe(false);
  });
});