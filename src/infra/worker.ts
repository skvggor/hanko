import { Room } from "@infra/server";

export { Room };

interface Env {
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
}

const ROOM_ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * The room id is the only secret guarding a room, so the alphabet is large and the
 * draw has to be uniform. A plain `byte % 30` biases the first characters of the
 * alphabet, so values that do not divide evenly are rejected and redrawn instead.
 */
export function generateRoomId(length = 8): string {
  const size = ROOM_ID_ALPHABET.length;
  const limit = 256 - (256 % size);
  let id = "";

  while (id.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));

    for (const byte of bytes) {
      if (byte >= limit) continue;
      id += ROOM_ID_ALPHABET[byte % size];
      if (id.length === length) break;
    }
  }

  return id;
}

function isValidRoomId(roomId: string): boolean {
  return /^[a-z0-9]{4,32}$/.test(roomId);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/room/")) {
      return handleRoomRequest(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleRoomRequest(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const segments = url.pathname.split("/").filter(Boolean);
  const roomId = segments[2];

  if (!roomId) {
    return Response.json({ error: "missing_room" }, { status: 400 });
  }

  if (request.method === "POST" && url.pathname.endsWith("/create")) {
    return createRoom();
  }

  if (!isValidRoomId(roomId)) {
    return Response.json({ error: "invalid_room_id" }, { status: 400 });
  }

  const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
  return stub.fetch(stripRoomPrefix(request));
}

function stripRoomPrefix(request: Request): Request {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const suffix = segments.slice(3).join("/");

  url.pathname = suffix === "" ? "/state" : `/${suffix}`;

  const token = new URL(request.url).searchParams.get("token");
  if (token !== null) url.searchParams.set("token", token);

  return new Request(url, request);
}

/**
 * Hands back an id only. The Durable Object is created lazily when someone
 * actually joins, so an unauthenticated loop over this endpoint cannot make the
 * platform instantiate anything; it costs one random draw.
 */
function createRoom(): Response {
  return Response.json({ roomId: generateRoomId() });
}