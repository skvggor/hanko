import { describe, expect, it } from "vitest";
import { readVotedState } from "@application/votedState";
import type { PublicRoomState } from "@domain/protocol";

function state(participants: PublicRoomState["participants"]): PublicRoomState {
  return {
    id: "room-1",
    deckId: "fibonacci",
    round: 1,
    isRevealed: false,
    participants,
    ownerId: null,
    gracePeriodMs: 300_000,
    connectedCount: participants.length,
    reveals: null,
    totalPoints: null,
    myVote: null,
  messages: [],
  name: null,
  };
}

function person(id: string, role: "voter" | "spectator", hasVoted: boolean) {
  return {
    id,
    name: id,
    role,
    isOwner: false,
    isConnected: true,
    hasVoted,
  };
}

describe("readVotedState", () => {
  it("reports an empty room", () => {
    const result = readVotedState(state([]));

    expect(result.empty).toBe(true);
    expect(result.total).toBe(0);
    expect(result.pending).toBe(0);
    expect(result.complete).toBe(false);
  });

  it("counts nobody as voted in a fresh room", () => {
    const result = readVotedState(state([person("a", "voter", false)]));

    expect(result.answered).toBe(0);
    expect(result.pending).toBe(1);
    expect(result.share).toBe(0);
    expect(result.complete).toBe(false);
  });

  it("counts everyone who answered", () => {
    const result = readVotedState(state([person("a", "voter", true)]));

    expect(result.answered).toBe(1);
    expect(result.pending).toBe(0);
    expect(result.complete).toBe(true);
  });

  it("tracks a partial room", () => {
    const result = readVotedState(
      state([
        person("a", "voter", true),
        person("b", "voter", true),
        person("c", "voter", false),
        person("d", "voter", false),
      ]),
    );

    expect(result.answered).toBe(2);
    expect(result.pending).toBe(2);
    expect(result.share).toBe(0.5);
    expect(result.complete).toBe(false);
  });

  it("never counts a watcher as pending", () => {
    const result = readVotedState(
      state([person("a", "voter", true), person("b", "spectator", false)]),
    );

    expect(result.pending).toBe(0);
    expect(result.complete).toBe(true);
    expect(result.share).toBe(1);
  });

  it("still counts a watcher in the head count", () => {
    const result = readVotedState(
      state([person("a", "voter", true), person("b", "spectator", false)]),
    );

    expect(result.total).toBe(2);
  });

  it("treats a room of only watchers as complete", () => {
    const result = readVotedState(
      state([person("a", "spectator", false), person("b", "spectator", false)]),
    );

    expect(result.pending).toBe(0);
    expect(result.complete).toBe(true);
    expect(result.empty).toBe(false);
  });

  it("never leaves watchers out of the share", () => {
    const result = readVotedState(
      state([
        person("a", "voter", true),
        person("b", "voter", true),
        person("c", "spectator", false),
        person("d", "spectator", false),
      ]),
    );

    expect(result.share).toBe(1);
  });
});