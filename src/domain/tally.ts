import type { VoteValue } from "@domain/deck";
import type { ParticipantRole } from "@domain/room";

export type Consensus = "aligned" | "close" | "split";

export interface VoteTally {
  /** Every reveal entry, in join order. */
  entries: Array<{
    participantId: string;
    name: string;
    role: ParticipantRole;
    vote: string | null;
    points: number | null;
  }>;
  /** Number of people who marked a number. */
  counted: number;
  /** Number of people still to vote or watching. */
  pending: number;
  /** Mean of the counted points, null when nobody picked a number. */
  average: number | null;
  total: number;
  min: number | null;
  max: number | null;
  /** Spread between the highest and lowest estimate. */
  range: number | null;
  /** Votes parked on "?" because they need a conversation. */
  needsDiscussion: number;
  /** Votes parked on coffee. */
  coffee: number;
  /** How many people picked each value, ordered by the scale. */
  distribution: Array<{ value: string; count: number }>;
  /** Share of the room that already voted, 0 to 1. */
  votedShare: number;
  /** True when nobody is still missing a vote. */
  everyoneVoted: boolean;
  /** How far apart the room turned out to be. */
  consensus: Consensus;
}

/**
 * Reads the revealed votes and derives everything the result sheet shows. People
 * watching are pending, never counted, so a spectator never skews the average.
 */

export function tallyReveals(
  entries: VoteTally["entries"],
  scale: readonly VoteValue[] | readonly string[],
): VoteTally {
  const countedPoints: number[] = [];

  let needsDiscussion = 0;
  let coffee = 0;
  let voted = 0;
  let answered = 0;

  for (const entry of entries) {
    if (entry.vote === "?") needsDiscussion += 1;
    if (entry.vote === "coffee") coffee += 1;

    if (entry.role === "spectator" || entry.points === null) continue;

    countedPoints.push(entry.points);
    voted += 1;
    answered += 1;
  }

  // A question mark or a coffee is still an answer, so the room counts as complete.
  answered += needsDiscussion + coffee;

  const total = countedPoints.reduce((sum, value) => sum + value, 0);
  const min = countedPoints.length === 0 ? null : Math.min(...countedPoints);
  const max = countedPoints.length === 0 ? null : Math.max(...countedPoints);

  const counts = new Map<string, number>();

  for (const entry of entries) {
    if (entry.vote === null) continue;
    counts.set(entry.vote, (counts.get(entry.vote) ?? 0) + 1);
  }

  const distribution = scale
    .map((value) => ({ value, count: counts.get(value) ?? 0 }))
    .filter((entry) => entry.count > 0);

  const pending = Math.max(0, entries.length - answered);

  return {
    entries,
    counted: countedPoints.length,
    pending,
    average: countedPoints.length === 0 ? null : round(total / countedPoints.length),
    total,
    min,
    max,
    range: min === null || max === null ? null : max - min,
    needsDiscussion,
    coffee,
    distribution,
    votedShare: entries.length === 0 ? 0 : voted / entries.length,
    everyoneVoted: entries.length > 0 && answered >= entries.length,
    consensus: readConsensus(countedPoints),
  };
}

/**
 * Judges how far apart the room landed, as a coefficient of variation: the
 * standard deviation over the mean. Comparing against the mean rather than an
 * absolute gap is what keeps it scale free, so 5 against 8 stays close on
 * Fibonacci while 3 against 10 does not.
 *
 * Span over mean was tried first and is wrong at the top end: a span equal to the
 * mean is maximum divergence, yet it scored exactly 1 and landed on the "close"
 * side of the threshold, which is how 3, 8 and 10 got labelled near agreement.
 */
export function readConsensus(points: readonly number[]): Consensus {
  if (points.length < 2) return "aligned";

  const mean = points.reduce((sum, value) => sum + value, 0) / points.length;
  if (mean <= 0) return "aligned";

  const variance =
    points.reduce((sum, value) => sum + (value - mean) ** 2, 0) / points.length;
  const variation = Math.sqrt(variance) / mean;

  if (variation <= 0.15) return "aligned";
  if (variation <= 0.3) return "close";
  return "split";
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

