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
