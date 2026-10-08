import { isRoomId } from "@domain/roomId";

export type AppRoute =
  | { kind: "home" }
  | { kind: "room"; roomId: string }
  | { kind: "missing-room" };

function segmentAfter(parts: string[], label: string): string | null {
  const index = parts.indexOf(label);
  if (index === -1) return null;
  return parts[index + 1] ?? null;
}

export function parseRoute(pathname: string): AppRoute {
  const parts = pathname.split("/").filter(Boolean);

  if (parts.length === 0) return { kind: "home" };

  const roomId = segmentAfter(parts, "room");

  if (roomId !== null && isRoomId(roomId)) {
    return { kind: "room", roomId };
  }

  // Someone opening a room link and getting the home screen with no word about it looks
  // like the app threw their room away, so the malformed case says so instead.
  if (parts[0] === "room") {
    return { kind: "missing-room" };
  }

  return { kind: "home" };
}

export function roomPath(roomId: string): string {
  return `/room/${roomId}`;
}