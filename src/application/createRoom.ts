export class CreateRoomError extends Error {
  constructor(readonly reason: "network" | "invalid_payload") {
    super(reason);
    this.name = "CreateRoomError";
  }
}

interface CreateRoomResponse {
  roomId?: unknown;
}

export async function createRoom(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<string> {
  let response: Response;

  try {
    response = await fetchImpl("/api/room/create", { method: "POST" });
  } catch {
    throw new CreateRoomError("network");
  }

  if (!response.ok) {
    throw new CreateRoomError("network");
  }

  let payload: CreateRoomResponse;

  try {
    payload = (await response.json()) as CreateRoomResponse;
  } catch {
    throw new CreateRoomError("invalid_payload");
  }

  if (typeof payload.roomId !== "string") {
    throw new CreateRoomError("invalid_payload");
  }

  return payload.roomId;
}