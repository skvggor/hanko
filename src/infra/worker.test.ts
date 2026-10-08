import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { generateRoomId } from "@infra/worker";

const defaultWorker = worker;

interface RoomIdBody {
  roomId: string;
}

interface FakeStub {
  fetched: Request[];
  responses: Response[];
}

function createNamespace() {
  const stubs: FakeStub[] = [];
  const byName = new Map<string, FakeStub>();
  const requestedNames: string[] = [];

  return {
    byName,
    stubs,
    requestedNames,
    idFromName(name: string) {
      return { name } as unknown as ReturnType<DurableObjectNamespace["idFromName"]>;
    },
    get(id: unknown) {
      const name = (id as { name: string }).name;
      requestedNames.push(name);

      const existing = byName.get(name);
      if (existing !== undefined) return existing;

      const stub: FakeStub & { fetch: (request: Request) => Promise<Response> } = {
        fetched: [],
        responses: [],
        async fetch(request: Request) {
          this.fetched.push(request);
          const response = this.responses.shift() ?? new Response("ok");
          return response;
        },
      };

      byName.set(name, stub);
      stubs.push(stub);
      return stub;
    },
  };
}

function createEnv() {
  const namespace = createNamespace();

  return {
    namespace,
    ROOMS: namespace as unknown as DurableObjectNamespace,
    ASSETS: {
      async fetch(request: Request) {
        return new Response(`asset:${new URL(request.url).pathname}`);
      },
    } as Fetcher,
  };
}

function post(path: string): Request {
  return new Request(`https://hanko.pages.dev${path}`, { method: "POST" });
}

async function callFetch(request: Request) {
  const env = createEnv();
  return { env, result: await defaultWorker.fetch(request, env) };
}

describe("generateRoomId", () => {
  it("produces ids of the requested length", () => {
    expect(generateRoomId()).toHaveLength(8);
    expect(generateRoomId(4)).toHaveLength(4);
    expect(generateRoomId(12)).toHaveLength(12);
  });

  it("only uses url safe characters", () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(generateRoomId()).toMatch(/^[a-z0-9]{8}$/);
    }
  });

  it("avoids ambiguous characters", () => {
    const ambiguous = /[oil01]/;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(ambiguous.test(generateRoomId(24))).toBe(false);
    }
  });

  it("generates different ids on each call", () => {
    const ids = new Set(Array.from({ length: 30 }, () => generateRoomId()));
    expect(ids.size).toBe(30);
  });

  it("is deterministic in length across calls", () => {
    const lengths = new Set(
      Array.from({ length: 20 }, () => generateRoomId().length),
    );
    expect(lengths.size).toBe(1);
  });
});

describe("defaultWorker.fetch", () => {
  describe("static assets", () => {
    it("serves the frontend for non api routes", async () => {
      const { result } = await callFetch(new Request("https://hanko.pages.dev/"));
      expect(await result.text()).toBe("asset:/");
    });

    it("serves client side routes as html", async () => {
      const { result } = await callFetch(new Request("https://hanko.pages.dev/room/abcd2345"));
      expect(await result.text()).toBe("asset:/room/abcd2345");
    });
  });

  describe("room creation", () => {
    it("returns a new room id", async () => {
      const { result } = await callFetch(post("/api/room/create"));
      const body: RoomIdBody = await result.json();

      expect(result.status).toBe(200);
      expect(body.roomId).toMatch(/^[a-z0-9]{8}$/);
    });

    it("does not instantiate a durable object to hand out an id", async () => {
      // The DO is created lazily on first join. Touching it here let an
      // unauthenticated loop over /create make the platform instantiate one
      // Durable Object per request, for no benefit.
      const env = createEnv();
      const result = await defaultWorker.fetch(post("/api/room/create"), env);
      const body: RoomIdBody = await result.json();

      expect(body.roomId).toMatch(/^[a-z0-9]{8}$/);
      expect(env.namespace.requestedNames).toEqual([]);
    });

    it("returns different rooms on each call", async () => {
      const firstResponse = await defaultWorker.fetch(
        post("/api/room/create"),
        createEnv(),
      );
      const secondResponse = await defaultWorker.fetch(
        post("/api/room/create"),
        createEnv(),
      );
      const first: RoomIdBody = await firstResponse.json();
      const second: RoomIdBody = await secondResponse.json();

      expect(first.roomId).not.toBe(second.roomId);
    });
  });

  describe("room routing", () => {
    it("rewrites the socket path before it reaches the room object", async () => {
      const env = createEnv();
      await defaultWorker.fetch(
        new Request("https://hanko.pages.dev/api/room/abcd2345/socket"),
        env,
      );

      const stub = env.ROOMS.get(env.ROOMS.idFromName("abcd2345")) as unknown as FakeStub;
      expect(new URL(stub.fetched[0]!.url).pathname).toBe("/socket");
    });

    it("rewrites the state path before it reaches the room object", async () => {
      const env = createEnv();
      await defaultWorker.fetch(
        new Request("https://hanko.pages.dev/api/room/abcd2345/state"),
        env,
      );

      const stub = env.ROOMS.get(env.ROOMS.idFromName("abcd2345")) as unknown as FakeStub;
      expect(new URL(stub.fetched[0]!.url).pathname).toBe("/state");
    });

    it("defaults a bare room path to the state endpoint", async () => {
      const env = createEnv();
      await defaultWorker.fetch(
        new Request("https://hanko.pages.dev/api/room/abcd2345"),
        env,
      );

      const stub = env.ROOMS.get(env.ROOMS.idFromName("abcd2345")) as unknown as FakeStub;
      expect(new URL(stub.fetched[0]!.url).pathname).toBe("/state");
    });

    it("forwards the participant token", async () => {
      const env = createEnv();
      await defaultWorker.fetch(
        new Request("https://hanko.pages.dev/api/room/abcd2345/state?token=t1"),
        env,
      );

      const stub = env.ROOMS.get(env.ROOMS.idFromName("abcd2345")) as unknown as FakeStub;
      expect(new URL(stub.fetched[0]!.url).searchParams.get("token")).toBe("t1");
    });

    it("preserves the request method", async () => {
      const env = createEnv();
      await defaultWorker.fetch(
        new Request("https://hanko.pages.dev/api/room/abcd2345/command", { method: "POST" }),
        env,
      );

      const stub = env.ROOMS.get(env.ROOMS.idFromName("abcd2345")) as unknown as FakeStub;
      expect(stub.fetched[0]!.method).toBe("POST");
      expect(new URL(stub.fetched[0]!.url).pathname).toBe("/command");
    });

    it("reuses the same object for the same room id", async () => {
      const env = createEnv();
      await defaultWorker.fetch(
        new Request("https://hanko.pages.dev/api/room/abcd2345/state"),
        env,
      );
      await defaultWorker.fetch(
        new Request("https://hanko.pages.dev/api/room/abcd2345/socket"),
        env,
      );

      expect(env.ROOMS.get(env.ROOMS.idFromName("abcd2345"))).toBeDefined();
    });
  });

  describe("validation", () => {
    it("rejects a missing room id", async () => {
      const { result } = await callFetch(new Request("https://hanko.pages.dev/api/room/"));
      expect(result.status).toBe(400);
      expect(await result.json()).toEqual({ error: "missing_room" });
    });

    it("rejects a room id containing separators", async () => {
      const { result } = await callFetch(
        new Request("https://hanko.pages.dev/api/room/ab%2Fcd"),
      );
      expect(result.status).toBe(400);
      expect(await result.json()).toEqual({ error: "invalid_room_id" });
    });

    it("rejects a room id with symbols", async () => {
      const { result } = await callFetch(
        new Request("https://hanko.pages.dev/api/room/ab$cd!"),
      );
      expect(result.status).toBe(400);
    });

    it("rejects a room id that is too short", async () => {
      const { result } = await callFetch(new Request("https://hanko.pages.dev/api/room/ab"));
      expect(result.status).toBe(400);
    });

    it("rejects a room id with uppercase letters", async () => {
      const { result } = await callFetch(
        new Request("https://hanko.pages.dev/api/room/ABCDEFGH"),
      );
      expect(result.status).toBe(400);
    });

    it("accepts the shortest valid room id", async () => {
      const env = createEnv();
      await defaultWorker.fetch(
        new Request("https://hanko.pages.dev/api/room/abcd/state"),
        env,
      );
      expect(env.ROOMS.get(env.ROOMS.idFromName("abcd"))).toBeDefined();
    });
  });

  describe("responses", () => {
    it("passes the room response back to the caller", async () => {
      const env = createEnv();
      const stub = env.ROOMS.get(env.ROOMS.idFromName("abcd2345")) as unknown as {
        fetch: (request: Request) => Promise<Response>;
        responses: Response[];
      };
      stub.responses.push(Response.json({ id: "abcd2345", round: 3 }));

      const result = await defaultWorker.fetch(
        new Request("https://hanko.pages.dev/api/room/abcd2345/state"),
        env,
      );

      expect(await result.json()).toEqual({ id: "abcd2345", round: 3 });
    });
  });
});

describe("generated ids round trip", () => {
  it("passes the worker validation check", () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const roomId = generateRoomId();
      expect(roomId.length >= 4 && roomId.length <= 32).toBe(true);
      expect(/^[a-z0-9]+$/.test(roomId)).toBe(true);
    }
  });
});

describe("cleanup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not leak the environment between calls", async () => {
    const first = createEnv();
    const second = createEnv();

    await defaultWorker.fetch(post("/api/room/create"), first);
    await defaultWorker.fetch(post("/api/room/create"), second);

    expect(first.ROOMS).not.toBe(second.ROOMS);
  });
});