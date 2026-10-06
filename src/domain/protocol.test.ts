import { describe, expect, it } from "vitest";
import { castVote, createRoom, joinRoom, reveal } from "@domain/room";
import {
  ERROR_CODES,
  type PublicRoomState,
  isClientMessage,
  isServerMessage,
  isViewPayload,
  isValidJoinName,
  toPublicState,
} from "@domain/protocol";

function roomWithVoted() {
  let room = createRoom("r");
  room = joinRoom(room, {
    id: "ana",
    token: "token-ana",
    name: "Ana",
    role: "voter",
    isOwner: true,
    isConnected: true,
  });
  room = joinRoom(room, {
    id: "bruno",
    token: "token-bruno",
    name: "Bruno",
    role: "spectator",
    isOwner: false,
    isConnected: true,
  });
  room = castVote(room, "ana", "8");
  return room;
}

describe("toPublicState", () => {
  it("never leaks the vote value before the reveal", () => {
    const state = toPublicState(roomWithVoted());

    expect(state.isRevealed).toBe(false);
    expect(state.reveals).toBeNull();
    expect(state.totalPoints).toBeNull();

    const ana = state.participants.find((entry) => entry.id === "ana");
    expect(ana?.hasVoted).toBe(true);
    expect(Object.keys(ana ?? {})).not.toContain("vote");
    expect(JSON.stringify(state)).not.toContain('"8"');
  });

  it("exposes the votes after the reveal", () => {
    const state = toPublicState(reveal(roomWithVoted()));

    expect(state.isRevealed).toBe(true);
    expect(state.reveals?.[0]).toEqual({
      participantId: "ana",
      name: "Ana",
      role: "voter",
      vote: "8",
      points: 8,
    });
    expect(state.totalPoints).toBe(8);
  });

  it("does not expose participant tokens", () => {
    const state = toPublicState(roomWithVoted());
    expect(JSON.stringify(state)).not.toContain("token-ana");
  });

  it("counts connected participants", () => {
    expect(toPublicState(roomWithVoted()).connectedCount).toBe(2);
  });

  it("reports zero connected in an empty room", () => {
    expect(toPublicState(createRoom("r")).connectedCount).toBe(0);
  });
});

describe("isViewPayload", () => {
  it("accepts a real state", () => {
    expect(isViewPayload(toPublicState(createRoom("r")))).toBe(true);
  });

  it("rejects unrelated payloads", () => {
    expect(isViewPayload(null)).toBe(false);
    expect(isViewPayload("state")).toBe(false);
    expect(isViewPayload({})).toBe(false);
    expect(isViewPayload({ id: "x", deckId: "unknown", round: 1, isRevealed: false, participants: [] })).toBe(false);
    expect(isViewPayload({ id: "x", deckId: "linear", round: "1", isRevealed: false, participants: [] })).toBe(false);
  });
});

describe("isClientMessage", () => {
  it("accepts every supported command", () => {
    expect(isClientMessage({ type: "join", name: "Ana", role: "voter", token: null })).toBe(true);
    expect(isClientMessage({ type: "vote", value: "8" })).toBe(true);
    expect(isClientMessage({ type: "reveal" })).toBe(true);
    expect(isClientMessage({ type: "next-round" })).toBe(true);
    expect(isClientMessage({ type: "reset-round" })).toBe(true);
    expect(isClientMessage({ type: "set-deck", deckId: "linear" })).toBe(true);
    expect(isClientMessage({ type: "set-role", participantId: "ana", role: "spectator" })).toBe(true);
    expect(isClientMessage({ type: "set-name", name: "Ana" })).toBe(true);
    expect(isClientMessage({ type: "transfer-ownership", participantId: "ana" })).toBe(true);
    expect(isClientMessage({ type: "remove-participant", participantId: "ana" })).toBe(true);
    expect(isClientMessage({ type: "delete-room" })).toBe(true);
    expect(isClientMessage({ type: "ping" })).toBe(true);
  });

  it("rejects malformed payloads", () => {
    expect(isClientMessage(null)).toBe(false);
    expect(isClientMessage("join")).toBe(false);
    expect(isClientMessage({})).toBe(false);
    expect(isClientMessage({ type: "unknown" })).toBe(false);
    expect(isClientMessage({ type: "join", name: 42 })).toBe(false);
    expect(isClientMessage({ type: "vote", value: 8 })).toBe(false);
    expect(isClientMessage({ type: "set-name", name: 8 })).toBe(false);
    expect(isClientMessage({ type: "set-deck", deckId: "nope" })).toBe(false);
    expect(isClientMessage({ type: "transfer-ownership" })).toBe(false);
    expect(isClientMessage({ type: "remove-participant" })).toBe(false);
    expect(isClientMessage({ type: "set-role", participantId: 1 })).toBe(false);
  });
});

describe("isServerMessage", () => {
  it("accepts known server frames", () => {
    expect(isServerMessage({ type: "state", state: toPublicState(createRoom("r")) })).toBe(true);
    expect(isServerMessage({ type: "joined", participantId: "a", token: "t", state: toPublicState(createRoom("r")) })).toBe(true);
    expect(isServerMessage({ type: "error", code: ERROR_CODES.notOwner })).toBe(true);
    expect(isServerMessage({ type: "room-deleted" })).toBe(true);
    expect(isServerMessage({ type: "pong" })).toBe(true);
  });

  it("rejects unknown frames", () => {
    expect(isServerMessage(null)).toBe(false);
    expect(isServerMessage({ type: "nope" })).toBe(false);
    expect(isServerMessage({})).toBe(false);
  });
});

describe("isValidJoinName", () => {
  it("delegates to name validation", () => {
    expect(isValidJoinName("Ana")).toBe(true);
    expect(isValidJoinName("  ")).toBe(false);
  });
});

describe("PublicRoomState", () => {
  it("carries the grace period for the countdown display", () => {
    const state: PublicRoomState = toPublicState(roomWithVoted());
    expect(state.gracePeriodMs).toBe(300_000);
  });
});