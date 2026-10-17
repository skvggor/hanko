export const CAT_BREEDS = ["tabby", "siamese", "black", "ginger", "spotted"] as const;

export type CatBreed = (typeof CAT_BREEDS)[number];

export type CatActivity = "idle" | "walking" | "jumping" | "sleeping" | "angry";

export interface CatState {
  participantId: string;
  breed: CatBreed;
  x: number;
  y: number;
  direction: "left" | "right";
  activity: CatActivity;
  isPaused: boolean;
}

export interface Cat {
  participantId: string;
  breed: CatBreed;
  name: string;
}

export const CAT_INACTIVITY_MS = 60_000;

const CAT_ACTIVITIES: readonly CatActivity[] = [
  "idle",
  "walking",
  "jumping",
  "sleeping",
  "angry",
];

export function isCatActivity(value: unknown): value is CatActivity {
  return typeof value === "string" && (CAT_ACTIVITIES as readonly string[]).includes(value);
}

export function isCatBreed(value: unknown): value is CatBreed {
  return typeof value === "string" && (CAT_BREEDS as readonly string[]).includes(value);
}

export function isCatState(value: unknown): value is CatState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<CatState>;
  return (
    typeof candidate.participantId === "string" &&
    isCatBreed(candidate.breed) &&
    typeof candidate.x === "number" &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.y) &&
    (candidate.direction === "left" || candidate.direction === "right") &&
    isCatActivity(candidate.activity) &&
    typeof candidate.isPaused === "boolean"
  );
}

/**
 * A small, stable hash of a string. Lives here because a participant id decides
 * both the breed a cat is given and how long its stride is, and those two answers
 * have to come out of the same number.
 */
export function stableHash(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + (value.codePointAt(index) ?? 0);
    hash = Math.trunc(hash);
  }

  return Math.abs(hash);
}

export function breedForParticipantId(participantId: string): CatBreed {
  const breed = CAT_BREEDS[stableHash(participantId) % CAT_BREEDS.length];
  return breed ?? CAT_BREEDS[0];
}

export interface EdgeSpot {
  readonly x: number;
  readonly y: number;
  readonly direction: "left" | "right";
}

export interface CatExclusionZone {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The header and the footer are pinned over the top and bottom edges, so a cat has to stand inside them. */
const EDGE_INSET = 0.08;

// Clamped rather than trusted: a nonsense aspect folds the border into a line and drops
// half the cats on top of each other.
const NARROWEST_SCREEN = 0.35;
const WIDEST_SCREEN = 3.5;
const EDGE_CANDIDATE_MULTIPLIER = 32;
const MINIMUM_EDGE_CANDIDATES = 128;

function edgeSpotAt(
  index: number,
  count: number,
  usable: number,
  width: number,
  height: number,
  perimeter: number,
): EdgeSpot {
  let along = ((index + 0.5) / count) * perimeter;
  let x: number;
  let y: number;

  // Clockwise from the top left, spending exactly as much of the walk on each side
  // as that side is long.
  if (along < width) {
    x = EDGE_INSET + along;
    y = EDGE_INSET;
  } else if ((along -= width) < height) {
    x = EDGE_INSET + width;
    y = EDGE_INSET + along;
  } else if ((along -= height) < width) {
    x = EDGE_INSET + width - along;
    y = EDGE_INSET + height;
  } else {
    along -= width;
    x = EDGE_INSET;
    y = EDGE_INSET + height - along;
  }

  const normalizedX = Math.min(1, Math.max(0, x / usable));

  return {
    x: normalizedX,
    y: Math.min(1, Math.max(0, y)),
    direction: normalizedX < 0.5 ? "right" : "left",
  };
}

function isExcluded(spot: EdgeSpot, exclusionZones: readonly CatExclusionZone[]): boolean {
  return exclusionZones.some(
    (zone) =>
      spot.x >= zone.left &&
      spot.x <= zone.right &&
      spot.y >= zone.top &&
      spot.y <= zone.bottom,
  );
}

/**
 * The border rather than a corner, which holds one cat and leaves the rest of them in
 * the way. Deterministic on purpose, so pressing it twice reads as a reset rather than
 * as a shuffle nobody can predict.
 */
export function spreadAlongTheEdges(
  count: number,
  aspect: number,
  exclusionZones: readonly CatExclusionZone[] = [],
): EdgeSpot[] {
  if (!Number.isFinite(count) || count <= 0) return [];
  const total = Math.floor(count);
  if (total === 0) return [];

  const usable = Number.isFinite(aspect)
    ? Math.min(WIDEST_SCREEN, Math.max(NARROWEST_SCREEN, aspect))
    : 1;

  // Worked out in the units of the screen and normalised at the end, because the
  // inset has to be the same distance on every side and the two axes are not the
  // same length.
  const width = usable - 2 * EDGE_INSET;
  const height = 1 - 2 * EDGE_INSET;
  const perimeter = 2 * (width + height);
  if (exclusionZones.length === 0) {
    return Array.from({ length: total }, (_, index) =>
      edgeSpotAt(index, total, usable, width, height, perimeter),
    );
  }

  const candidateCount = Math.max(
    MINIMUM_EDGE_CANDIDATES,
    total * EDGE_CANDIDATE_MULTIPLIER,
  );
  const available = Array.from({ length: candidateCount }, (_, index) =>
    edgeSpotAt(index, candidateCount, usable, width, height, perimeter),
  ).filter((spot) => !isExcluded(spot, exclusionZones));

  if (available.length === 0) return [];

  return Array.from({ length: total }, (_, index) => {
    const availableIndex = Math.floor(((index + 0.5) / total) * available.length);
    return available[availableIndex] ?? available.at(-1) ?? edgeSpotAt(
      index,
      total,
      usable,
      width,
      height,
      perimeter,
    );
  });
}
