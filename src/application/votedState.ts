import type { PublicRoomState } from "@domain/protocol";

export interface VotedState {
  /** People who still owe a vote. */
  pending: number;
  /** People who have answered, number or otherwise. */
  answered: number;
  /** People in the room, watchers included. */
  total: number;
  /** Share of voters (watchers excluded) that have answered, 0 to 1. */
  share: number;
  /** True when no voter is left holding an unvoted card. */
  complete: boolean;
  /** True when nobody is in the room. */
  empty: boolean;
}

/**
 * Who has spoken yet. Watchers are never counted as pending: they are there to look,
 * so a room of one voter and four watchers reads as complete, not as four absences.
 */
export function readVotedState(state: PublicRoomState): VotedState {
  const voters = state.participants.filter((entry) => entry.role === "voter");
  const total = state.participants.length;

  if (total === 0) {
    return { pending: 0, answered: 0, total: 0, share: 0, complete: false, empty: true };
  }

  if (voters.length === 0) {
    return { pending: 0, answered: 0, total, share: 1, complete: true, empty: false };
  }

  const answered = voters.filter((entry) => entry.hasVoted).length;

  return {
    pending: voters.length - answered,
    answered,
    total,
    share: answered / voters.length,
    complete: answered === voters.length,
    empty: false,
  };
}