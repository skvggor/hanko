import { beforeEach, describe, expect, it } from "vitest";
import { Room } from "@infra/server";
import type { castVote} from "@domain/room";
import { createRoom, joinRoom } from "@domain/room";
import { isServerMessage, type PublicRoomState } from "@domain/protocol";

interface FakeSocket {
  sent: string[];
  closed: boolean;
  closeCode: number | null;
  close(): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
  send(payload: string): void;
}

type WebSocketPairConstructor = new () => {
  0: FakeSocket;
  1: FakeSocket;
};

const globalsWithWorkerTypes = globalThis as unknown as {
  WebSocketPair?: WebSocketPairConstructor;
};

function installWebSocketPair(): void {
  globalsWithWorkerTypes.WebSocketPair = class {
    0 = createFakeSocket();
    1 = createFakeSocket();
  };
}

type ResponseConstructor = new (
  body?: unknown,
  init?: unknown,
) => Response;

interface MutableGlobals {
  Response: ResponseConstructor | undefined;
}

const globalsWithResponse = globalThis as unknown as MutableGlobals;

interface UpgradeInit {
  status: number;
  webSocket: unknown;
}

async function captureUpgradeResponse(
  run: () => Promise<unknown>,
): Promise<UpgradeInit> {
  const originalResponse = globalsWithResponse.Response;
  let captured: UpgradeInit | null = null;

  globalsWithResponse.Response = class {
    constructor(_body?: unknown, init?: UpgradeInit) {
      captured = init ?? { status: 0, webSocket: null };
    }
  } as unknown as ResponseConstructor;

  try {
    await run();
  } finally {
    globalsWithResponse.Response = originalResponse;
  }

  if (captured === null) throw new Error("no upgrade response captured");
  return captured;
}

function createFakeSocket(): FakeSocket & { attachment: unknown } {
  const socket = {
    sent: [] as string[],
    attachment: null as unknown,
    close(code?: number) {
      socket.closed = true;
      socket.closeCode = code ?? null;
    },
    closed: false,
    closeCode: null as number | null,
    serializeAttachment(value: unknown) {
      socket.attachment = value;
    },
    deserializeAttachment() {
      return socket.attachment;
    },
    send(payload: string) {
      // Cloudflare throws when you send on a closed socket, and the room relies on
      // that to stop feeding a removed participant.
      if (socket.closed) throw new Error("socket is closed");
      socket.sent.push(payload);
    },
  };
  return socket;
}

function createFakeStorage(initial: unknown = null) {
  const data = new Map<string, unknown>();
  if (initial !== null) data.set("room", initial);
  const sockets: FakeSocket[] = [];
  let alarmAt: number | null = null;

  return {
    id: { toString: () => "test-room" },
    acceptWebSocket(socket: FakeSocket) {
      sockets.push(socket);
    },
    getWebSockets() {
      return sockets;
    },
    storage: {
      async get(key: string) {
        return data.get(key);
      },
      async put(key: string, value: unknown) {
        data.set(key, value);
      },
      async delete(key: string) {
        data.delete(key);
      },
      async setAlarm(at: number) {
        alarmAt = at;
      },
    },
    get alarmAt() {
      return alarmAt;
    },
    data,
    sockets,
    addSocket(socket: FakeSocket) {
      sockets.push(socket);
    },
  };
}

function parse(sent: string[]): Array<Record<string, unknown>> {
  return sent.map((entry) => JSON.parse(entry) as Record<string, unknown>);
}

function connect(
  storage: ReturnType<typeof createFakeStorage>,
  socket: FakeSocket,
): void {
  storage.addSocket(socket);
}

type FetchedState = { id: string; participants: unknown[]; ownerId: string | null };

describe("Room over HTTP", () => {
  it("returns the public state for an unknown room", async () => {
    const storage = createFakeStorage();
    const room = new Room(storage as never);
    const response: Response = await room.fetch(
      new Request("https://room.internal/state"),
    );

    expect(response.status).toBe(200);
    const state: FetchedState = await response.json();
    expect(state.id).toBe("test-room");
    expect(state.participants).toEqual([]);
  });

  it("rejects unknown paths", async () => {
    const storage = createFakeStorage();
    const room = new Room(storage as never);
    const response = await room.fetch(new Request("https://room.internal/nope"));
    expect(response.status).toBe(404);
  });

  it("upgrades the socket endpoint and accepts the server socket", async () => {
    installWebSocketPair();
    const storage = createFakeStorage();
    const room = new Room(storage as never);

    const init = await captureUpgradeResponse(() =>
      room.fetch(new Request("https://room.internal/socket")),
    );

    expect(init.status).toBe(101);
    expect(storage.getWebSockets()).toHaveLength(1);
  });

  it("hands the client socket back to the caller", async () => {
    installWebSocketPair();
    const storage = createFakeStorage();
    const room = new Room(storage as never);

    const init = await captureUpgradeResponse(() =>
      room.fetch(new Request("https://room.internal/socket")),
    );

    const accepted = storage.getWebSockets()[0];
    expect(init.webSocket).not.toBe(accepted);
    expect(init.webSocket).toBeTruthy();
  });

  it("starts the server socket as anonymous", async () => {
    installWebSocketPair();
    const storage = createFakeStorage();
    const room = new Room(storage as never);

    await captureUpgradeResponse(() =>
      room.fetch(new Request("https://room.internal/socket")),
    );

    const accepted = storage.getWebSockets()[0];
    expect(accepted?.deserializeAttachment()).toEqual({
      participantId: null,
      token: null,
    });
  });
});

describe("Room over WebSocket", () => {
  let storage: ReturnType<typeof createFakeStorage>;
  let room: Room;

  beforeEach(() => {
    storage = createFakeStorage();
    room = new Room(storage as never);
  });

  async function joinAs(name: string, role: "voter" | "spectator" = "voter") {
    const socket = createFakeSocket();
    connect(storage, socket);
    await room.webSocketMessage(socket as never, JSON.stringify({
      type: "join",
      token: null,
      name,
      role,
    }));
    return socket;
  }

  const lastState = (socket: FakeSocket): { state: PublicRoomState } => {
    const states = parse(socket.sent).filter((entry) => entry["type"] === "state");
    return states.at(-1) as { state: PublicRoomState };
  };

  const lastChat = (socket: FakeSocket) => {
    const chats = parse(socket.sent).filter((entry) => entry["type"] === "chat");
    return chats.at(-1)?.["message"] as
      | { id: string; authorId: string; authorName: string; text: string; sentAt: number }
      | undefined;
  };

  const storedMessages = (): Array<{ text: string }> => {
    const entry = storage.data.get("room") as
      | { room: { messages?: Array<{ text: string }> } }
      | undefined;
    return entry?.room.messages ?? [];
  };

  const stateFrames = (socket: FakeSocket) =>
    parse(socket.sent).filter((entry) => entry["type"] === "state");

  const lastJoined = (socket: FakeSocket) => {
    const messages = parse(socket.sent);
    const joined = messages.find((entry) => entry["type"] === "joined");
    return joined as {
      participantId: string;
      token: string;
      state: PublicRoomState;
    };
  };

  describe("a room persisted before the chat field existed", () => {
    /**
     * Regression: the stored snapshot had no `messages`, so the state the client
     * received failed `isViewPayload` and was dropped, leaving the join gate up
     * forever. Restoring must backfill instead of trusting the stored shape.
     */
    function legacyStorage() {
      const { messages: _messages, ...room } = createRoom("test-room");
      return createFakeStorage({ room });
    }

    it("lets a participant join", async () => {
      const legacy = legacyStorage();
      const socket = createFakeSocket();
      connect(legacy, socket);
      const legacyRoom = new Room(legacy as never);

      await legacyRoom.webSocketMessage(socket as never, JSON.stringify({
        type: "join",
        token: null,
        name: "Ana",
        role: "voter",
      }));

      const joined = lastJoined(socket);
      expect(joined.state.messages).toEqual([]);
      expect(joined.state.participants).toHaveLength(1);
    });

    it("sends a state the client will accept", async () => {
      const legacy = legacyStorage();
      const socket = createFakeSocket();
      connect(legacy, socket);
      const legacyRoom = new Room(legacy as never);

      await legacyRoom.webSocketMessage(socket as never, JSON.stringify({
        type: "join",
        token: null,
        name: "Ana",
        role: "voter",
      }));

      for (const frame of parse(socket.sent)) {
        expect(isServerMessage(frame)).toBe(true);
      }
    });

    it("survives removing a participant, which reads messages", async () => {
      const legacy = legacyStorage();
      const socket = createFakeSocket();
      connect(legacy, socket);
      const legacyRoom = new Room(legacy as never);

      await legacyRoom.webSocketMessage(socket as never, JSON.stringify({
        type: "join",
        token: null,
        name: "Ana",
        role: "voter",
      }));
      const second = createFakeSocket();
      connect(legacy, second);
      await legacyRoom.webSocketMessage(second as never, JSON.stringify({
        type: "join",
        token: null,
        name: "Bia",
        role: "voter",
      }));
      const secondId = lastJoined(second).participantId;

      await legacyRoom.webSocketMessage(socket as never, JSON.stringify({
        type: "remove-participant",
        participantId: secondId,
      }));

      expect(lastState(socket).state.participants).toHaveLength(1);
    });

    it("accepts a chat message", async () => {
      const legacy = legacyStorage();
      const socket = createFakeSocket();
      connect(legacy, socket);
      const legacyRoom = new Room(legacy as never);

      await legacyRoom.webSocketMessage(socket as never, JSON.stringify({
        type: "join",
        token: null,
        name: "Ana",
        role: "voter",
      }));
      await legacyRoom.webSocketMessage(socket as never, JSON.stringify({
        type: "chat",
        text: "oi",
      }));

      const entry = legacy.data.get("room") as { room: { messages: unknown[] } };
      expect(entry.room.messages).toHaveLength(1);
    });
  });

  describe("set-role", () => {
    it("lets the owner change a role", async () => {
      const ana = await joinAs("Ana");
      const bia = await joinAs("Bia");
      const biaId = lastJoined(bia).participantId;

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "set-role",
        participantId: biaId,
        role: "spectator",
      }));

      const biaNow = lastState(ana).state.participants.find((p) => p.id === biaId);
      expect(biaNow?.role).toBe("spectator");
    });

    it("refuses a spectator promoting itself to voter", async () => {
      const ana = await joinAs("Ana");
      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "set-role",
        participantId: lastJoined(ana).participantId,
        role: "spectator",
      }));
      const anaId = lastJoined(ana).participantId;

      await joinAs("Bia");
      const spectator = await joinAs("spectator", "spectator");
      const spectatorId = lastJoined(spectator).participantId;

      await room.webSocketMessage(spectator as never, JSON.stringify({
        type: "set-role",
        participantId: spectatorId,
        role: "voter",
      }));

      const errors = parse(spectator.sent).filter((entry) => entry["type"] === "error");
      expect(errors.at(-1)?.["code"]).toBe("not_owner");

      const now = lastState(ana).state.participants.find((p) => p.id === spectatorId);
      expect(now?.role).toBe("spectator");
      expect(anaId).not.toBe(spectatorId);
    });

    it("refuses a role that is not voter or spectator", async () => {
      const ana = await joinAs("Ana");
      const bia = await joinAs("Bia");

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "set-role",
        participantId: lastJoined(bia).participantId,
        role: "superuser",
      }));

      const errors = parse(ana.sent).filter((entry) => entry["type"] === "error");
      expect(errors.at(-1)?.["code"]).toBe("unauthorized");

      const biaNow = lastState(ana).state.participants.find((p) => p.id === lastJoined(bia).participantId);
      expect(biaNow?.role).toBe("voter");
    });
  });

  describe("hostile frames", () => {
    it("rejects a chat text that is not a string", async () => {
      const ana = await joinAs("Ana");

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "chat",
        text: 12345,
      }));

      const errors = parse(ana.sent).filter((entry) => entry["type"] === "error");
      expect(errors.at(-1)?.["code"]).toBe("unauthorized");
    });

    it("rejects a join name that is not a string", async () => {
      const socket = createFakeSocket();
      connect(storage, socket);

      await room.webSocketMessage(socket as never, JSON.stringify({
        type: "join",
        token: null,
        name: null,
        role: "voter",
      }));

      const errors = parse(socket.sent).filter((entry) => entry["type"] === "error");
      expect(errors.at(-1)?.["code"]).toBe("unauthorized");
    });

    it("rejects a session name that is not a string", async () => {
      const ana = await joinAs("Ana");

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "set-room-name",
        name: { evil: true },
      }));

      const errors = parse(ana.sent).filter((entry) => entry["type"] === "error");
      expect(errors.at(-1)?.["code"]).toBe("unauthorized");
    });

    it("rejects an unknown command", async () => {
      const ana = await joinAs("Ana");

      await room.webSocketMessage(ana as never, JSON.stringify({ type: "drop-database" }));

      const errors = parse(ana.sent).filter((entry) => entry["type"] === "error");
      expect(errors.at(-1)?.["code"]).toBe("unauthorized");
    });
  });

  describe("abuse controls", () => {
    it("refuses a websocket handshake from another origin", async () => {
      const response = await room.fetch(
        new Request("https://room.internal/socket", {
          headers: { origin: "https://evil.example", host: "hanko.pages.dev" },
        }),
      );

      expect(response.status).toBe(403);
    });

    it("refuses a chat flood from one socket", async () => {
      const ana = await joinAs("Ana");

      for (let index = 0; index < 5; index += 1) {
        await room.webSocketMessage(ana as never, JSON.stringify({
          type: "chat",
          text: `msg ${index}`,
        }));
      }

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "chat",
        text: "one too many",
      }));

      const errors = parse(ana.sent).filter((entry) => entry["type"] === "error");
      expect(errors.at(-1)?.["code"]).toBe("rate_limited");
      expect(parse(ana.sent).filter((entry) => entry["type"] === "chat")).toHaveLength(5);
    });

    it("does not let one socket starve another", async () => {
      const ana = await joinAs("Ana");
      const bia = await joinAs("Bia");

      for (let index = 0; index < 6; index += 1) {
        await room.webSocketMessage(ana as never, JSON.stringify({
          type: "chat",
          text: `msg ${index}`,
        }));
      }

      await room.webSocketMessage(bia as never, JSON.stringify({
        type: "chat",
        text: "still fine",
      }));

      expect(lastChat(bia)?.text).toBe("still fine");
    });

    it("does not let a chat flood starve ordinary commands", async () => {
      const ana = await joinAs("Ana");

      for (let index = 0; index < 6; index += 1) {
        await room.webSocketMessage(ana as never, JSON.stringify({
          type: "chat",
          text: `msg ${index}`,
        }));
      }

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "set-room-name",
        name: "Still works",
      }));

      expect(lastState(ana).state.name).toBe("Still works");
    });

    it("still lets a voting session run well past the chat budget", async () => {
      const ana = await joinAs("Ana");
      const bia = await joinAs("Bia");

      for (const value of ["0", "1", "2", "3", "5", "8", "13"]) {
        await room.webSocketMessage(ana as never, JSON.stringify({ type: "vote", value }));
        await room.webSocketMessage(bia as never, JSON.stringify({ type: "vote", value }));
      }

      const errors = parse(ana.sent).filter((entry) => entry["type"] === "error");
      expect(errors).toHaveLength(0);
      expect(lastState(ana).state.participants.every((p) => p.hasVoted)).toBe(true);
    });

    it("refuses a join flood from one socket", async () => {
      const socket = createFakeSocket();
      connect(storage, socket);

      for (const name of ["Ana", "Bia", "Cid", "Dan", "Eva", "Fay", "Gil", "Hal", "Ivy", "Joe"]) {
        await room.webSocketMessage(socket as never, JSON.stringify({
          type: "join", token: null, name, role: "voter",
        }));
      }

      await room.webSocketMessage(socket as never, JSON.stringify({
        type: "join", token: null, name: "Kim", role: "voter",
      }));

      const errors = parse(socket.sent).filter((entry) => entry["type"] === "error");
      expect(errors.at(-1)?.["code"]).toBe("rate_limited");
    });

    it("does not let extra sockets buy extra chat allowance", async () => {
      const ana = await joinAs("Ana");

      for (let index = 0; index < 5; index += 1) {
        await room.webSocketMessage(ana as never, JSON.stringify({
          type: "chat",
          text: `msg ${index}`,
        }));
      }

      const extra = createFakeSocket();
      storage.addSocket(extra);
      extra.serializeAttachment({ participantId: "ana", token: lastJoined(ana).token });

      await room.webSocketMessage(extra as never, JSON.stringify({
        type: "chat",
        text: "second connection",
      }));

      const errors = parse(extra.sent).filter((entry) => entry["type"] === "error");
      expect(errors.at(-1)?.["code"]).toBe("rate_limited");
    });

    it("rejects a socket past the room ceiling", async () => {
      for (let index = 0; index < 80; index += 1) storage.addSocket(createFakeSocket());

      const response = await room.fetch(new Request("https://room.internal/socket"));
      expect(response.status).toBe(503);
    });
  });

  describe("removing a participant", () => {
    async function removeBia() {
      const ana = await joinAs("Ana");
      const bia = await joinAs("Bia");
      const biaId = lastJoined(bia).participantId;

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "remove-participant",
        participantId: biaId,
      }));

      return { ana, bia, biaId };
    }

    it("tells the removed person why", async () => {
      const { bia } = await removeBia();

      const frames = parse(bia.sent);
      expect(frames.at(-1)?.["type"]).toBe("removed");
    });

    it("hangs up on the removed socket", async () => {
      const { bia } = await removeBia();

      expect(bia.closed).toBe(true);
      expect(bia.closeCode).toBe(4003);
    });

    it("leaves everyone else connected", async () => {
      const { ana, bia } = await removeBia();

      expect(ana.closed).toBe(false);
      expect(bia.closed).toBe(true);
    });

    it("drops the removed socket from the room broadcast", async () => {
      const { ana, bia } = await removeBia();
      const before = bia.sent.length;

      await room.webSocketMessage(ana as never, JSON.stringify({ type: "reveal" }));

      expect(lastState(ana).state.isRevealed).toBe(true);
      expect(bia.sent.length).toBe(before);
    });

    it("refuses the removed token coming back", async () => {
      const { bia } = await removeBia();
      const token = lastJoined(bia).token;
      const again = createFakeSocket();
      connect(storage, again);

      await room.webSocketMessage(again as never, JSON.stringify({
        type: "join",
        token,
        name: "Bia",
        role: "voter",
      }));

      const errors = parse(again.sent).filter((entry) => entry["type"] === "error");
      expect(errors.at(-1)?.["code"]).toBe("participant_removed");
      expect(parse(again.sent).some((entry) => entry["type"] === "joined")).toBe(false);
    });

    it("keeps their messages out of the room", async () => {
      const ana = await joinAs("Ana");
      const bia = await joinAs("Bia");
      await room.webSocketMessage(bia as never, JSON.stringify({
        type: "chat",
        text: "sou removida",
      }));

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "remove-participant",
        participantId: lastJoined(bia).participantId,
      }));

      expect(lastState(ana).state.messages).toEqual([]);
    });

    it("lets a brand new person still join afterwards", async () => {
      await removeBia();

      const dani = await joinAs("Dani");

      expect(parse(dani.sent).some((entry) => entry["type"] === "joined")).toBe(true);
      expect(dani.closed).toBe(false);
    });

    it("does not tombstone a room that has no such token", async () => {
      const { ana } = await removeBia();
      const entry = storage.data.get("room") as {
        room: { removedTokens: string[] };
      };

      expect(entry.room.removedTokens).toHaveLength(1);
      expect(lastState(ana).state.participants).toHaveLength(1);
    });
  });

  describe("session name", () => {
    it("stores the name chosen by the owner", async () => {
      const ana = await joinAs("Ana");

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "set-room-name",
        name: "Sprint 42",
      }));

      expect(lastState(ana).state.name).toBe("Sprint 42");
    });

    it("tells everyone in the room", async () => {
      const ana = await joinAs("Ana");
      const bia = await joinAs("Bia");

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "set-room-name",
        name: "Planning",
      }));

      expect(lastState(bia).state.name).toBe("Planning");
    });

    it("gives a late joiner the name", async () => {
      const ana = await joinAs("Ana");
      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "set-room-name",
        name: "Retrospective",
      }));

      const bia = await joinAs("Bia");

      expect(lastJoined(bia).state.name).toBe("Retrospective");
    });

    it("survives a reconnect", async () => {
      const ana = await joinAs("Ana");
      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "set-room-name",
        name: "Planning",
      }));
      const token = lastJoined(ana).token;

      const rejoined = createFakeSocket();
      connect(storage, rejoined);
      await room.webSocketMessage(rejoined as never, JSON.stringify({
        type: "join",
        token,
        name: "Ana",
        role: "voter",
      }));

      expect(lastJoined(rejoined).state.name).toBe("Planning");
    });

    it("refuses the name from a non owner", async () => {
      const ana = await joinAs("Ana");
      const bia = await joinAs("Bia");

      await room.webSocketMessage(bia as never, JSON.stringify({
        type: "set-room-name",
        name: "Taking over",
      }));

      const errors = parse(bia.sent).filter((entry) => entry["type"] === "error");
      expect(errors.at(-1)?.["code"]).toBe("not_owner");
      expect(lastState(ana).state.name).toBeNull();
    });

    it("trims before storing", async () => {
      const ana = await joinAs("Ana");

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "set-room-name",
        name: "  Sprint  42  ",
      }));

      expect(lastState(ana).state.name).toBe("Sprint 42");
    });

    it("refuses an empty name", async () => {
      const ana = await joinAs("Ana");

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "set-room-name",
        name: "   ",
      }));

      const errors = parse(ana.sent).filter((entry) => entry["type"] === "error");
      expect(errors.at(-1)?.["code"]).toBe("session_name_required");
    });

    it("refuses a name with an invisible character", async () => {
      const ana = await joinAs("Ana");

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "set-room-name",
        name: "Sprint\u200b42",
      }));

      const errors = parse(ana.sent).filter((entry) => entry["type"] === "error");
      expect(errors.at(-1)?.["code"]).toBe("session_name_invalid");
    });

    it("clears the name on null", async () => {
      const ana = await joinAs("Ana");
      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "set-room-name",
        name: "Planning",
      }));

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "set-room-name",
        name: null,
      }));

      expect(lastState(ana).state.name).toBeNull();
    });

    it("keeps the name when the owner leaves", async () => {
      const ana = await joinAs("Ana");
      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "set-room-name",
        name: "Planning",
      }));
      const bia = await joinAs("Bia");
      const anaId = lastJoined(ana).participantId;

      await room.webSocketMessage(bia as never, JSON.stringify({
        type: "remove-participant",
        participantId: anaId,
      }));

      expect(lastState(bia).state.name).toBe("Planning");
    });

    it("lets the new owner take over the name", async () => {
      const ana = await joinAs("Ana");
      const bia = await joinAs("Bia");
      const biaId = lastJoined(bia).participantId;
      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "transfer-ownership",
        participantId: biaId,
      }));

      await room.webSocketMessage(bia as never, JSON.stringify({
        type: "set-room-name",
        name: "Novo tema",
      }));

      expect(lastState(bia).state.name).toBe("Novo tema");
    });

    it("lets a room persisted before the field existed join with no name", async () => {
      const { messages: _messages, name: _name, ...legacy } = createRoom("test-room");
      const legacyStorage = createFakeStorage({ room: legacy });
      const socket = createFakeSocket();
      connect(legacyStorage, socket);
      const legacyRoom = new Room(legacyStorage as never);

      await legacyRoom.webSocketMessage(socket as never, JSON.stringify({
        type: "join",
        token: null,
        name: "Ana",
        role: "voter",
      }));

      expect(lastJoined(socket).state.name).toBeNull();
    });
  });

  describe("chat", () => {
    it("delivers the message to everyone including the sender", async () => {
      const ana = await joinAs("Ana");
      const bia = await joinAs("Bia");

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "chat",
        text: "vamos nessa",
      }));

      expect(lastChat(ana)?.text).toBe("vamos nessa");
      expect(lastChat(bia)?.text).toBe("vamos nessa");
      expect(lastChat(ana)?.id).toBe(lastChat(bia)?.id);
    });

    it("does not rebroadcast the room when somebody speaks", async () => {
      // This is the whole point: a chat frame must not push a fresh
      // PublicRoomState at every client, because that re-renders the whole board
      // and makes the estimate section appear to flicker.
      const ana = await joinAs("Ana");
      const bia = await joinAs("Bia");
      const before = { ana: stateFrames(ana).length, bia: stateFrames(bia).length };

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "chat",
        text: "oi",
      }));

      expect(stateFrames(ana).length).toBe(before.ana);
      expect(stateFrames(bia).length).toBe(before.bia);
    });

    it("still carries the message in the state for a late joiner", async () => {
      const ana = await joinAs("Ana");
      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "chat",
        text: "cheguei primeiro",
      }));

      const bia = await joinAs("Bia");

      expect(lastJoined(bia).state.messages.map((m) => m.text)).toEqual([
        "cheguei primeiro",
      ]);
    });

    it("attributes the message to the sender name", async () => {
      const ana = await joinAs("Ana");

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "chat",
        text: "oi",
      }));

      expect(lastChat(ana)?.authorName).toBe("Ana");
      expect(lastChat(ana)?.text).toBe("oi");
      expect(lastChat(ana)?.sentAt).toBeTypeOf("number");
      expect(lastChat(ana)?.authorId).toBe(lastJoined(ana).participantId);
    });

    it("gives a late joiner the backlog", async () => {
      const ana = await joinAs("Ana");
      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "chat",
        text: "cheguei primeiro",
      }));

      const bia = await joinAs("Bia");

      expect(lastJoined(bia).state.messages).toHaveLength(1);
      expect(lastJoined(bia).state.messages[0]?.text).toBe("cheguei primeiro");
    });

    it("survives a reconnect", async () => {
      const ana = await joinAs("Ana");
      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "chat",
        text: "fica",
      }));
      const token = lastJoined(ana).token;

      const rejoined = createFakeSocket();
      connect(storage, rejoined);
      await room.webSocketMessage(rejoined as never, JSON.stringify({
        type: "join",
        token,
        name: "Ana",
        role: "voter",
      }));

      expect(lastJoined(rejoined).state.messages).toHaveLength(1);
    });

    it("trims and caps the text", async () => {
      const ana = await joinAs("Ana");

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "chat",
        text: "  oi\n\n  mundo  ",
      }));

      expect(lastChat(ana)?.text).toBe("oi mundo");
    });

    it("refuses an empty message", async () => {
      const ana = await joinAs("Ana");

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "chat",
        text: "   \n  ",
      }));

      const errors = parse(ana.sent).filter((entry) => entry["type"] === "error");
      expect(errors.at(-1)?.["code"]).toBe("empty_message");
      expect(lastState(ana).state.messages).toHaveLength(0);
    });

    it("refuses a message from someone who never joined", async () => {
      const ghost = createFakeSocket();
      connect(storage, ghost);

      await room.webSocketMessage(ghost as never, JSON.stringify({
        type: "chat",
        text: "fantasma",
      }));

      const errors = parse(ghost.sent).filter((entry) => entry["type"] === "error");
      expect(errors.at(-1)?.["code"]).toBe("unauthorized");
    });

    it("lets the owner clear the conversation", async () => {
      const ana = await joinAs("Ana");
      const bia = await joinAs("Bia");
      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "chat",
        text: "some",
      }));

      await room.webSocketMessage(ana as never, JSON.stringify({ type: "clear-chat" }));

      expect(lastState(ana).state.messages).toEqual([]);
      expect(lastState(bia).state.messages).toEqual([]);
    });

    it("refuses clear-chat from a non owner", async () => {
      const ana = await joinAs("Ana");
      const bia = await joinAs("Bia");
      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "chat",
        text: "some",
      }));

      await room.webSocketMessage(bia as never, JSON.stringify({ type: "clear-chat" }));

      const errors = parse(bia.sent).filter((entry) => entry["type"] === "error");
      expect(errors.at(-1)?.["code"]).toBe("not_owner");
      expect(storedMessages().map((entry) => entry.text)).toEqual(["some"]);
    });

    it("drops messages of a removed participant", async () => {
      const ana = await joinAs("Ana");
      const bia = await joinAs("Bia");
      const biaId = lastJoined(bia).participantId;
      await room.webSocketMessage(bia as never, JSON.stringify({
        type: "chat",
        text: "sou removida",
      }));

      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "remove-participant",
        participantId: biaId,
      }));

      expect(lastState(ana).state.messages).toEqual([]);
    });

    it("keeps messages across a round change", async () => {
      const ana = await joinAs("Ana");
      await room.webSocketMessage(ana as never, JSON.stringify({
        type: "chat",
        text: "segunda rodada",
      }));

      await room.webSocketMessage(ana as never, JSON.stringify({ type: "next-round" }));

      expect(lastState(ana).state.messages).toHaveLength(1);
    });
  });

  it("joins a participant and returns a token", async () => {
    const socket = await joinAs("Ana");
    const joined = lastJoined(socket);

    expect(joined.participantId).toBeTruthy();
    expect(joined.token).toBeTruthy();
    expect(joined.state.participants).toHaveLength(1);
  });

  it("makes the first participant the owner", async () => {
    const socket = await joinAs("Ana");
    expect(lastJoined(socket).state.ownerId).toBe(lastJoined(socket).participantId);
  });

  it("rejects an empty name", async () => {
    const socket = await joinAs("   ");
    const messages = parse(socket.sent);
    expect(messages.at(-1)).toEqual({ type: "error", code: "name_required" });
  });

  it("rejects a name with symbols", async () => {
    const socket = await joinAs("Ana@!");
    expect(parse(socket.sent).at(-1)).toEqual({
      type: "error",
      code: "name_invalid",
    });
  });

  it("rejects malformed json", async () => {
    const socket = createFakeSocket();
    connect(storage, socket);
    await room.webSocketMessage(socket as never, "{not json");
    expect(parse(socket.sent).at(-1)).toEqual({
      type: "error",
      code: "unauthorized",
    });
  });

  it("rejects non object payloads", async () => {
    const socket = createFakeSocket();
    connect(storage, socket);
    await room.webSocketMessage(socket as never, JSON.stringify("hello"));
    expect(parse(socket.sent).at(-1)).toEqual({
      type: "error",
      code: "unauthorized",
    });
  });

  it("answers ping with pong", async () => {
    const socket = createFakeSocket();
    connect(storage, socket);
    await room.webSocketMessage(socket as never, JSON.stringify({ type: "ping" }));
    expect(parse(socket.sent).at(-1)).toEqual({ type: "pong" });
  });

  it("refuses commands before joining", async () => {
    const socket = createFakeSocket();
    connect(storage, socket);
    await room.webSocketMessage(socket as never, JSON.stringify({
      type: "vote",
      value: "8",
    }));
    expect(parse(socket.sent).at(-1)).toEqual({
      type: "error",
      code: "unauthorized",
    });
  });

  it("records a vote without revealing it", async () => {
    const ownerSocket = await joinAs("Ana");
    const ownerId = lastJoined(ownerSocket).participantId;

    const voterSocket = await joinAs("Bruno");
    const voterId = lastJoined(voterSocket).participantId;

    await room.webSocketMessage(voterSocket as never, JSON.stringify({
      type: "vote",
      value: "8",
    }));

    const voterView = lastState(voterSocket).state;
    const ownerView = lastState(ownerSocket).state;

    expect(voterView.isRevealed).toBe(false);
    expect(voterView.reveals).toBeNull();
    expect(voterView.participants.find((entry) => entry.id === voterId)?.hasVoted).toBe(true);
    expect(voterView.myVote).toBe("8");

    expect(ownerView.isRevealed).toBe(false);
    expect(ownerView.reveals).toBeNull();
    expect(ownerView.myVote).toBeNull();
    expect(ownerView.participants.find((entry) => entry.id === voterId)?.hasVoted).toBe(true);
    expect(JSON.stringify(ownerView)).not.toContain('"8"');
    expect(ownerId).not.toBe(voterId);
  });

  it("rejects a vote outside the deck", async () => {
    const socket = await joinAs("Ana");
    await room.webSocketMessage(socket as never, JSON.stringify({
      type: "vote",
      value: "99",
    }));
    expect(parse(socket.sent).at(-1)).toEqual({
      type: "error",
      code: "invalid_vote",
    });
  });

  it("rejects a vote from a spectator", async () => {
    const spectatorSocket = await joinAs("Ana", "spectator");
    await room.webSocketMessage(spectatorSocket as never, JSON.stringify({
      type: "vote",
      value: "8",
    }));

    const states = parse(spectatorSocket.sent).filter((entry) => entry["type"] === "state");
    const latest = states.at(-1) as { state: PublicRoomState };
    expect(latest.state.participants[0]?.hasVoted).toBe(false);
  });

  it("reveals the votes to everybody", async () => {
    const ownerSocket = await joinAs("Ana");
    const voterSocket = await joinAs("Bruno");

    await room.webSocketMessage(voterSocket as never, JSON.stringify({
      type: "vote",
      value: "8",
    }));
    await room.webSocketMessage(ownerSocket as never, JSON.stringify({ type: "reveal" }));

    const states = parse(ownerSocket.sent).filter((entry) => entry["type"] === "state");
    const latest = states.at(-1) as { state: PublicRoomState };

    expect(latest.state.isRevealed).toBe(true);
    expect(latest.state.totalPoints).toBe(8);
    expect(latest.state.reveals).toHaveLength(2);
  });

  it("blocks non owner members from revealing", async () => {
    const ownerSocket = await joinAs("Ana");
    const otherSocket = await joinAs("Bruno");

    await room.webSocketMessage(otherSocket as never, JSON.stringify({ type: "reveal" }));
    expect(parse(otherSocket.sent).at(-1)).toEqual({
      type: "error",
      code: "not_owner",
    });
    expect(parse(ownerSocket.sent).some((entry) => entry["type"] === "error")).toBe(false);
  });

  it("advances the round and clears votes", async () => {
    const ownerSocket = await joinAs("Ana");
    const otherSocket = await joinAs("Bruno");

    await room.webSocketMessage(otherSocket as never, JSON.stringify({
      type: "vote",
      value: "8",
    }));
    await room.webSocketMessage(ownerSocket as never, JSON.stringify({ type: "reveal" }));
    await room.webSocketMessage(ownerSocket as never, JSON.stringify({ type: "next-round" }));

    const states = parse(ownerSocket.sent).filter((entry) => entry["type"] === "state");
    const latest = states.at(-1) as { state: PublicRoomState };

    expect(latest.state.round).toBe(2);
    expect(latest.state.isRevealed).toBe(false);
    expect(latest.state.reveals).toBeNull();
    expect(latest.state.participants.every((entry) => !entry.hasVoted)).toBe(true);
  });

  it("resets votes keeping the round number", async () => {
    const ownerSocket = await joinAs("Ana");
    const otherSocket = await joinAs("Bruno");

    await room.webSocketMessage(otherSocket as never, JSON.stringify({
      type: "vote",
      value: "8",
    }));
    await room.webSocketMessage(ownerSocket as never, JSON.stringify({ type: "reset-round" }));

    const states = parse(ownerSocket.sent).filter((entry) => entry["type"] === "state");
    const latest = states.at(-1) as { state: PublicRoomState };

    expect(latest.state.round).toBe(1);
    expect(latest.state.participants.every((entry) => !entry.hasVoted)).toBe(true);
  });

  it("changes the deck for the owner", async () => {
    const ownerSocket = await joinAs("Ana");
    await room.webSocketMessage(ownerSocket as never, JSON.stringify({
      type: "set-deck",
      deckId: "tshirt",
    }));

    const states = parse(ownerSocket.sent).filter((entry) => entry["type"] === "state");
    expect((states.at(-1) as { state: PublicRoomState }).state.deckId).toBe("tshirt");
  });

  it("renames the joining participant", async () => {
    const socket = await joinAs("Ana");
    await room.webSocketMessage(socket as never, JSON.stringify({
      type: "set-name",
      name: "  Ana   Paula ",
    }));

    const states = parse(socket.sent).filter((entry) => entry["type"] === "state");
    expect((states.at(-1) as { state: PublicRoomState }).state.participants[0]?.name).toBe(
      "Ana Paula",
    );
  });

  it("rejects an invalid rename", async () => {
    const socket = await joinAs("Ana");
    await room.webSocketMessage(socket as never, JSON.stringify({
      type: "set-name",
      name: "1234",
    }));
    expect(parse(socket.sent).at(-1)).toEqual({
      type: "error",
      code: "name_invalid",
    });
  });

  it("transfers ownership and lets the new owner act", async () => {
    const ownerSocket = await joinAs("Ana");
    const otherSocket = await joinAs("Bruno");
    const otherId = lastJoined(otherSocket).participantId;

    await room.webSocketMessage(ownerSocket as never, JSON.stringify({
      type: "transfer-ownership",
      participantId: otherId,
    }));
    await room.webSocketMessage(otherSocket as never, JSON.stringify({ type: "reveal" }));

    const states = parse(otherSocket.sent).filter((entry) => entry["type"] === "state");
    expect((states.at(-1) as { state: PublicRoomState }).state.isRevealed).toBe(true);
  });

  it("removes a participant", async () => {
    const ownerSocket = await joinAs("Ana");
    const otherSocket = await joinAs("Bruno");
    const otherId = lastJoined(otherSocket).participantId;

    await room.webSocketMessage(ownerSocket as never, JSON.stringify({
      type: "remove-participant",
      participantId: otherId,
    }));

    const states = parse(ownerSocket.sent).filter((entry) => entry["type"] === "state");
    expect((states.at(-1) as { state: PublicRoomState }).state.participants).toHaveLength(1);
  });

  it("announces room deletion", async () => {
    const ownerSocket = await joinAs("Ana");
    await room.webSocketMessage(ownerSocket as never, JSON.stringify({ type: "delete-room" }));

    expect(parse(ownerSocket.sent).at(-1)).toEqual({ type: "room-deleted" });
    expect(storage.data.has("room")).toBe(false);
  });

  it("reconnects an existing participant by token", async () => {
    const socket = await joinAs("Ana");
    const { token } = lastJoined(socket);

    const returningSocket = createFakeSocket();
    connect(storage, returningSocket);
    await room.webSocketMessage(returningSocket as never, JSON.stringify({
      type: "join",
      token,
      name: "Ana",
      role: "voter",
    }));

    const rejoined = lastJoined(returningSocket);
    expect(rejoined.token).toBe(token);
    expect(rejoined.state.participants).toHaveLength(1);
  });

  it("restores the vote of a reconnecting participant", async () => {
    const ownerSocket = await joinAs("Ana");
    const voterSocket = await joinAs("Bruno");
    const { token } = lastJoined(voterSocket);

    await room.webSocketMessage(voterSocket as never, JSON.stringify({
      type: "vote",
      value: "13",
    }));

    const returningSocket = createFakeSocket();
    connect(storage, returningSocket);
    await room.webSocketMessage(returningSocket as never, JSON.stringify({
      type: "join",
      token,
      name: "Bruno",
      role: "voter",
    }));

    const rejoined = lastJoined(returningSocket);
    expect(rejoined.state.participants.find((entry) => entry.name === "Bruno")?.hasVoted).toBe(
      true,
    );
    expect(ownerSocket.sent.length).toBeGreaterThan(0);
  });

  it("marks a participant as disconnected when the socket closes", async () => {
    const ownerSocket = await joinAs("Ana");
    const otherSocket = await joinAs("Bruno");
    const otherId = lastJoined(otherSocket).participantId;

    await room.webSocketClose(otherSocket as never);

    const states = parse(ownerSocket.sent).filter((entry) => entry["type"] === "state");
    const latest = states.at(-1) as { state: PublicRoomState };
    expect(latest.state.participants.find((entry) => entry.id === otherId)?.isConnected).toBe(
      false,
    );
    expect(latest.state.connectedCount).toBe(1);
  });

  it("treats a socket error like a close", async () => {
    const ownerSocket = await joinAs("Ana");
    const otherSocket = await joinAs("Bruno");

    await room.webSocketError(otherSocket as never);

    const states = parse(ownerSocket.sent).filter((entry) => entry["type"] === "state");
    const latest = states.at(-1) as { state: PublicRoomState };
    expect(latest.state.connectedCount).toBe(1);
  });

  it("schedules the grace period when the last person goes offline", async () => {
    const ownerSocket = await joinAs("Ana");
    await room.webSocketClose(ownerSocket as never);

    expect(storage.alarmAt).not.toBeNull();
    expect(storage.alarmAt).toBeGreaterThan(Date.now());
  });

  it("keeps the room alive for five minutes", async () => {
    const ownerSocket = await joinAs("Ana");
    await room.webSocketClose(ownerSocket as never);

    const scheduled = storage.alarmAt;
    const delay = (scheduled ?? 0) - Date.now();
    expect(delay).toBeGreaterThan(290_000);
    expect(delay).toBeLessThanOrEqual(300_000);
  });

  it("keeps the session state through the grace period", async () => {
    const ownerSocket = await joinAs("Ana");
    const voterSocket = await joinAs("Bruno");
    await room.webSocketMessage(voterSocket as never, JSON.stringify({
      type: "vote",
      value: "8",
    }));
    await room.webSocketClose(voterSocket as never);
    await room.webSocketClose(ownerSocket as never);

    const stored = storage.data.get("room") as { room: ReturnType<typeof castVote> };
    expect(stored.room.round).toBe(1);
    expect(stored.room.participants).toHaveLength(2);
  });

  it("deletes the state when the alarm fires with nobody connected", async () => {
    const ownerSocket = await joinAs("Ana");
    await room.webSocketClose(ownerSocket as never);
    await room.alarm();

    expect(storage.data.has("room")).toBe(false);
  });

  it("keeps the state when the alarm fires with somebody connected", async () => {
    const ownerSocket = await joinAs("Ana");
    const sentBefore = ownerSocket.sent.length;
    await room.alarm();

    expect(storage.data.has("room")).toBe(true);
    expect(ownerSocket.sent).toHaveLength(sentBefore);
  });

  it("restores state written by a previous instance", async () => {
    let roomState = createRoom("test-room");
    roomState = joinRoom(roomState, {
      id: "ana",
      token: "token-ana",
      name: "Ana",
      role: "voter",
      isOwner: true,
      isConnected: true,
    });

    const storage = createFakeStorage({ room: roomState });
    const restored = new Room(storage as never);
    const response = await restored.fetch(new Request("https://room.internal/state"));
    const state: FetchedState = await response.json();

    expect(state.participants).toHaveLength(1);
    expect(state.ownerId).toBe("ana");
  });

  it("keeps the participant identity across two joins with the same token", async () => {
    const first = createFakeSocket();
    connect(storage, first);
    await room.webSocketMessage(first as never, JSON.stringify({
      type: "join",
      token: null,
      name: "Ana",
      role: "voter",
    }));
    const { token, participantId } = lastJoined(first);

    const second = createFakeSocket();
    connect(storage, second);
    await room.webSocketMessage(second as never, JSON.stringify({
      type: "join",
      token,
      name: "Ana Maria",
      role: "voter",
    }));

    const rejoined = lastJoined(second);
    expect(rejoined.participantId).toBe(participantId);
    expect(rejoined.state.participants[0]?.name).toBe("Ana Maria");
  });

  it("keeps one participant when two tabs share a token", async () => {
    const first = createFakeSocket();
    connect(storage, first);
    await room.webSocketMessage(first as never, JSON.stringify({
      type: "join",
      token: null,
      name: "Ana",
      role: "voter",
    }));
    const { token } = lastJoined(first);

    const second = createFakeSocket();
    connect(storage, second);
    await room.webSocketMessage(second as never, JSON.stringify({
      type: "join",
      token,
      name: "Ana",
      role: "voter",
    }));

    expect(lastJoined(second).state.participants).toHaveLength(1);
  });

  it("keeps the participant connected while another tab is open", async () => {
    const first = createFakeSocket();
    connect(storage, first);
    await room.webSocketMessage(first as never, JSON.stringify({
      type: "join",
      token: null,
      name: "Ana",
      role: "voter",
    }));
    const { token, participantId } = lastJoined(first);

    const second = createFakeSocket();
    connect(storage, second);
    await room.webSocketMessage(second as never, JSON.stringify({
      type: "join",
      token,
      name: "Ana",
      role: "voter",
    }));

    await room.webSocketClose(second as never);

    const states = parse(first.sent).filter((entry) => entry["type"] === "state");
    const latest = states.at(-1) as { state: PublicRoomState };
    expect(latest.state.participants.find((entry) => entry.id === participantId)?.isConnected).toBe(
      true,
    );
  });
});
