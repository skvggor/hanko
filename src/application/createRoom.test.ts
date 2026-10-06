import { describe, expect, it, vi } from "vitest";
import { CreateRoomError, createRoom } from "@application/createRoom";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("createRoom", () => {
  it("posts to the create endpoint", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ roomId: "abc12345" }));

    await createRoom(fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith("/api/room/create", { method: "POST" });
  });

  it("returns the new room id", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ roomId: "abc12345" }));
    await expect(createRoom(fetchImpl as unknown as typeof fetch)).resolves.toBe("abc12345");
  });

  it("fails when the network is unreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });

    await expect(createRoom(fetchImpl as unknown as typeof fetch)).rejects.toBeInstanceOf(
      CreateRoomError,
    );
  });

  it("fails on a server error", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 }));

    await expect(createRoom(fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({
      reason: "network",
    });
  });

  it("fails when the body is not json", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>", { status: 200 }));

    await expect(createRoom(fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({
      reason: "invalid_payload",
    });
  });

  it("fails when the room id is missing", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));

    await expect(createRoom(fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({
      reason: "invalid_payload",
    });
  });

  it("fails when the room id is not a string", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ roomId: 42 }));

    await expect(createRoom(fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({
      reason: "invalid_payload",
    });
  });

  it("carries a readable name on the error", () => {
    expect(new CreateRoomError("network").name).toBe("CreateRoomError");
  });
});