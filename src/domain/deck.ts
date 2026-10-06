export const DECK_FIBONACCI = [
  "0",
  "1",
  "2",
  "3",
  "5",
  "8",
  "13",
  "21",
  "?",
  "coffee",
] as const;

export const DECK_TSHIRT = ["XS", "S", "M", "L", "XL", "XXL"] as const;

export const DECK_LINEAR = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;

export const DECKS = {
  fibonacci: DECK_FIBONACCI,
  tshirt: DECK_TSHIRT,
  linear: DECK_LINEAR,
} as const;

export type DeckId = keyof typeof DECKS;

export type VoteValue = (typeof DECKS)[DeckId][number];

export const DECK_IDS = Object.keys(DECKS) as DeckId[];

export const DEFAULT_DECK_ID: DeckId = "fibonacci";

export function isDeckId(value: unknown): value is DeckId {
  return typeof value === "string" && Object.hasOwn(DECKS, value);
}

export function isVoteValue(deckId: DeckId, value: unknown): value is VoteValue {
  return (
    typeof value === "string" && (DECKS[deckId] as readonly string[]).includes(value)
  );
}

export function getDeck(deckId: DeckId): readonly string[] {
  return DECKS[deckId];
}

export function pointsFor(value: string): number | null {
  if (value === "?") return null;
  if (value === "coffee") return 0;

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isSpecialValue(value: string): boolean {
  return value === "?" || value === "coffee";
}

export function voteValueKey(value: string): string {
  return value === "coffee" ? "vote.coffee" : `vote.${value}`;
}