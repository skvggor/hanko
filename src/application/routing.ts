export type AppRoute =
  | { kind: "home" }
  | { kind: "room"; roomId: string };

const ROOM_PATTERN = /^[a-z0-9]{4,32}$/;

function segmentAfter(parts: string[], label: string): string | null {
  const index = parts.indexOf(label);
  if (index === -1) return null;
  return parts[index + 1] ?? null;
}

export function parseRoute(pathname: string): AppRoute {
  const parts = pathname.split("/").filter(Boolean);

  if (parts.length === 0) return { kind: "home" };

  const roomId = segmentAfter(parts, "room");

  if (roomId !== null && ROOM_PATTERN.test(roomId)) {
    return { kind: "room", roomId };
  }

  if (parts[0] === "room" && roomId !== null) {
    return { kind: "home" };
  }

  return { kind: "home" };
}

export function roomPath(roomId: string): string {
  return `/room/${roomId}`;
}