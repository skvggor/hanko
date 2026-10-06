import { describe, expect, it } from "vitest";
import { Room } from "@infra/server";
import type { PublicRoomState } from "@domain/protocol";
import type { Participant } from "@domain/room";
import { createRoom, joinRoom } from "@domain/room";

interface FakeSocket {
  attachment: unknown;
  sent: string[];
  close(): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
  send(payload: string): void;
}

function createFakeSocket(): FakeSocket {
  const socket: FakeSocket = {
    attachment: null,
    sent: [],
    close() {},
    serializeAttachment(value: unknown) {
      socket.attachment = value;
    },
    deserializeAttachment() {
      return socket.attachment;
    },
    send(payload: string) {
      socket.sent.push(payload);
    },
  };
  return socket;
}

function createFakeStorage(initial: unknown = null) {
  const data = new Map<string, unknown>();
  if (initial !== null) data.set("room", initial);
  const sockets: FakeSocket[] = [];

  return {
    id: { toString: () => "test-room" },
    acceptWebSocket(socket: FakeSocket) {
      sockets.push(socket);
    },
    addSocket(socket: FakeSocket) {
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
      async setAlarm() {},
    },
    data,
  };
}

function draft(
  id: string,
  token: string,
): Omit<Participant, "vote" | "disconnectedAt"> {
  return {
    id,
    token,
    name: id,
    role: "voter",
    isOwner: true,
    isConnected: true,
  };
}

function roomWithVote(token: string) {
  let room = createRoom("test-room");
  room = joinRoom(room, draft("ana", token));
  room = {
    ...room,
    participants: room.participants.map((participant) => ({
      ...participant,
      vote: "8",
    })),
  };
  return room;
}

describe("Room state over HTTP", () => {
  it("hides every vote when no token is presented", async () => {
    const storage = createFakeStorage({ room: roomWithVote("token-ana") });
    const room = new Room(storage as never);

    const response = await room.fetch(
      new Request("https://room.internal/state"),
    );
    const state: PublicRoomState = await response.json();

    expect(state.myVote).toBeNull();
    expect(state.isRevealed).toBe(false);
    expect(JSON.stringify(state)).not.toContain('"8"');
  });

  it("shows the vote only to the owner of the token", async () => {
    const storage = createFakeStorage({ room: roomWithVote("token-ana") });
    const room = new Room(storage as never);

    const response = await room.fetch(
      new Request("https://room.internal/state?token=token-ana"),
    );
    const state: PublicRoomState = await response.json();

    expect(state.myVote).toBe("8");
  });

  it("ignores an unknown token", async () => {
    const storage = createFakeStorage({ room: roomWithVote("token-ana") });
    const room = new Room(storage as never);

    const response = await room.fetch(
      new Request("https://room.internal/state?token=nope"),
    );
    const state: PublicRoomState = await response.json();

    expect(state.myVote).toBeNull();
  });

  it("does not hand a connected socket vote to an anonymous caller", async () => {
    // Regression: /state used to fall back to the sole attached socket token, so
    // anyone who guessed a room id could read the one hidden vote of a two person
    // room. A vote is only ever returned for a token the caller actually presents.
    const storage = createFakeStorage({ room: roomWithVote("token-ana") });
    const socket = createFakeSocket();
    socket.serializeAttachment({ participantId: "ana", token: "token-ana" });
    storage.addSocket(socket);

    const room = new Room(storage as never);
    const response = await room.fetch(new Request("https://room.internal/state"));
    const state: PublicRoomState = await response.json();

    expect(state.myVote).toBeNull();
  });

  it("still resolves the vote for a caller that presents the token", async () => {
    const storage = createFakeStorage({ room: roomWithVote("token-ana") });

    const room = new Room(storage as never);
    const response = await room.fetch(
      new Request("https://room.internal/state?token=token-ana"),
    );
    const state: PublicRoomState = await response.json();

    expect(state.myVote).toBe("8");
  });

  it("prefers the url token over the socket identity", async () => {
    const storage = createFakeStorage({
      room: (() => {
        let room = createRoom("test-room");
        room = joinRoom(room, draft("ana", "token-ana"));
        room = joinRoom(room, {
          ...draft("bruno", "token-bruno"),
          isOwner: false,
        });
        return room;
      })(),
    });

    const socket = createFakeSocket();
    socket.serializeAttachment({ participantId: "ana", token: "token-ana" });
    storage.addSocket(socket);

    const room = new Room(storage as never);
    const response = await room.fetch(
      new Request("https://room.internal/state?token=token-bruno"),
    );
    const state: PublicRoomState = await response.json();

    expect(state.myVote).toBeNull();
  });

  it("still answers when the room has no socket", async () => {
    const storage = createFakeStorage();
    const room = new Room(storage as never);

    const response = await room.fetch(new Request("https://room.internal/state"));

    expect(response.status).toBe(200);
    const state: PublicRoomState = await response.json();
    expect(state.participants).toEqual([]);
  });
});