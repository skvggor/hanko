import { describe, expect, it } from "vitest";
import { isViewPayload, toPublicState } from "@domain/protocol";
import {
  type Participant,
  type RoomSnapshot,
  availableVotes,
  buildRevealEntries,
  castVote,
  countConnected,
  GRACE_PERIOD_MS,
  MAX_PARTICIPANTS,
  REMOVED_TOKEN_LIMIT,
  appendMessage,
  createRoom,
  deleteRoom,
  disconnectParticipant,
  findByToken,
  joinRoom,
  leaveRoom,
  restoreRoom,
  reconnectParticipant,
  reclaimDisconnected,
  isRemovedToken,
  removeParticipant,
  resetRound,
  reveal,
  setDeck,
  setParticipantName,
  setParticipantRole,
  shouldRoomExpire,
  startNextRound,
  tallyPoints,
  transferOwnership,
} from "@domain/room";

type DraftParticipant = Omit<Participant, "vote" | "disconnectedAt">;

function draft(
  id: string,
  overrides: Partial<DraftParticipant> = {},
): DraftParticipant {
  return {
    id,
    token: `token-${id}`,
    name: id,
    role: "voter",
    isOwner: false,
    isConnected: true,
    ...overrides,
  };
}

function roomWith(...participants: DraftParticipant[]): RoomSnapshot {
  let room = createRoom("room");
  for (const participant of participants) {
    room = joinRoom(room, participant);
  }
  return room;
}

describe("createRoom", () => {
  it("starts empty with a five minute grace period", () => {
    const room = createRoom("abc");
    expect(room.id).toBe("abc");
    expect(room.participants).toEqual([]);
    expect(room.ownerId).toBeNull();
    expect(room.round).toBe(1);
    expect(room.isRevealed).toBe(false);
    expect(room.gracePeriodMs).toBe(300_000);
  });
});

describe("joinRoom", () => {
  it("adds a participant without a vote", () => {
    const room = joinRoom(createRoom("r"), draft("ana"));
    expect(room.participants).toHaveLength(1);
    expect(room.participants[0]?.vote).toBeNull();
  });

  it("makes the first participant the owner", () => {
    const room = joinRoom(createRoom("r"), draft("ana"));
    expect(room.ownerId).toBe("ana");
    expect(room.participants[0]?.isOwner).toBe(true);
  });

  it("does not make later participants owner", () => {
    const room = roomWith(draft("ana"), draft("bruno"));
    expect(room.ownerId).toBe("ana");
    expect(room.participants[1]?.isOwner).toBe(false);
  });

  it("refuses to join a full room", () => {
    const room = roomWith(draft("solo"));
    const many = { ...room, participants: Array.from({ length: 50 }, (_, index) => ({
      id: `p${index}`,
      token: `t${index}`,
      name: `p${index}`,
      role: "voter" as const,
      isOwner: index === 0,
      isConnected: true,
      disconnectedAt: null,
      vote: null,
    })) };

    const result = joinRoom(many, draft("late"));
    expect(result).toBe(many);
    expect(result.participants).toHaveLength(50);
  });
});

describe("disconnectParticipant and reconnectParticipant", () => {
  it("marks a participant as disconnected", () => {
    const room = disconnectParticipant(roomWith(draft("ana")), "ana");
    expect(room.participants[0]?.isConnected).toBe(false);
  });

  it("marks a participant as connected again", () => {
    let room = roomWith(draft("ana"));
    room = disconnectParticipant(room, "ana");
    room = reconnectParticipant(room, "ana");
    expect(room.participants[0]?.isConnected).toBe(true);
  });
});

describe("findByToken", () => {
  it("finds the participant owning a token", () => {
    const room = roomWith(draft("ana"));
    expect(findByToken(room, "token-ana")?.id).toBe("ana");
  });

  it("returns undefined for an unknown token", () => {
    const room = roomWith(draft("ana"));
    expect(findByToken(room, "nope")).toBeUndefined();
  });
});

describe("castVote", () => {
  it("records a vote", () => {
    const room = castVote(roomWith(draft("ana")), "ana", "8");
    expect(room.participants[0]?.vote).toBe("8");
  });

  it("toggles the vote off when the same value is chosen again", () => {
    let room = castVote(roomWith(draft("ana")), "ana", "8");
    room = castVote(room, "ana", "8");
    expect(room.participants[0]?.vote).toBeNull();
  });

  it("replaces a previous vote with a new one", () => {
    let room = castVote(roomWith(draft("ana")), "ana", "8");
    room = castVote(room, "ana", "13");
    expect(room.participants[0]?.vote).toBe("13");
  });

  it("hides the reveal again when the vote changes", () => {
    let room = reveal(roomWith(draft("ana")));
    room = castVote(room, "ana", "5");
    expect(room.isRevealed).toBe(false);
  });

  it("ignores a value outside the deck", () => {
    const room = roomWith(draft("ana"));
    expect(castVote(room, "ana", "99")).toBe(room);
  });

  it("ignores a vote from an unknown participant", () => {
    const room = roomWith(draft("ana"));
    expect(castVote(room, "ghost", "8")).toBe(room);
  });

  it("ignores a vote from a spectator", () => {
    const room = roomWith(draft("ana", { role: "spectator" }));
    expect(castVote(room, "ana", "8")).toBe(room);
  });

  it("accepts the question mark", () => {
    const room = castVote(roomWith(draft("ana")), "ana", "?");
    expect(room.participants[0]?.vote).toBe("?");
  });
});

describe("setDeck", () => {
  it("changes the deck", () => {
    const room = setDeck(roomWith(draft("ana")), "tshirt");
    expect(room.deckId).toBe("tshirt");
  });

  it("clears existing votes", () => {
    let room = castVote(roomWith(draft("ana")), "ana", "8");
    room = setDeck(room, "tshirt");
    expect(room.participants[0]?.vote).toBeNull();
  });

  it("returns the same room when the deck is unchanged", () => {
    const room = roomWith(draft("ana"));
    expect(setDeck(room, "fibonacci")).toBe(room);
  });
});

describe("reveal", () => {
  it("marks the room as revealed", () => {
    expect(reveal(roomWith(draft("ana"))).isRevealed).toBe(true);
  });
});

describe("startNextRound", () => {
  it("increments the round", () => {
    expect(startNextRound(roomWith(draft("ana"))).round).toBe(2);
  });

  it("clears votes and hides the reveal", () => {
    let room = castVote(roomWith(draft("ana")), "ana", "8");
    room = reveal(room);
    room = startNextRound(room);
    expect(room.participants[0]?.vote).toBeNull();
    expect(room.isRevealed).toBe(false);
  });
});

describe("resetRound", () => {
  it("keeps the round number but clears votes", () => {
    let room = castVote(roomWith(draft("ana")), "ana", "8");
    room = resetRound(room);
    expect(room.round).toBe(1);
    expect(room.participants[0]?.vote).toBeNull();
  });
});

describe("setParticipantRole", () => {
  it("switches a voter to spectator", () => {
    const room = setParticipantRole(roomWith(draft("ana")), "ana", "spectator");
    expect(room.participants[0]?.role).toBe("spectator");
  });

  it("clears the vote when becoming a spectator", () => {
    let room = castVote(roomWith(draft("ana")), "ana", "8");
    room = setParticipantRole(room, "ana", "spectator");
    expect(room.participants[0]?.vote).toBeNull();
  });

  it("restores a spectator to voter", () => {
    let room = roomWith(draft("ana", { role: "spectator" }));
    room = setParticipantRole(room, "ana", "voter");
    expect(room.participants[0]?.role).toBe("voter");
  });

  it("ignores an unknown participant", () => {
    const room = roomWith(draft("ana"));
    expect(setParticipantRole(room, "ghost", "spectator")).toBe(room);
  });

  it("ignores a role change to the same role", () => {
    const room = roomWith(draft("ana"));
    expect(setParticipantRole(room, "ana", "voter")).toBe(room);
  });
});

describe("setParticipantName", () => {
  it("renames a participant", () => {
    const room = setParticipantName(roomWith(draft("ana")), "ana", "Ana Maria");
    expect(room.participants[0]?.name).toBe("Ana Maria");
  });
});

describe("leaveRoom", () => {
  it("removes the participant", () => {
    const room = leaveRoom(roomWith(draft("ana"), draft("bruno")), "ana");
    expect(room.participants).toHaveLength(1);
    expect(room.participants[0]?.id).toBe("bruno");
  });

  it("clears the owner when the owner leaves", () => {
    const room = leaveRoom(roomWith(draft("ana"), draft("bruno")), "ana");
    expect(room.ownerId).toBeNull();
  });

  it("hides the reveal when someone leaves", () => {
    let room = reveal(roomWith(draft("ana"), draft("bruno")));
    room = leaveRoom(room, "bruno");
    expect(room.isRevealed).toBe(false);
  });
});

describe("transferOwnership", () => {
  it("moves ownership to the target", () => {
    const room = transferOwnership(roomWith(draft("ana"), draft("bruno")), "bruno");
    expect(room.ownerId).toBe("bruno");
    expect(room.participants.find((entry) => entry.id === "bruno")?.isOwner).toBe(true);
    expect(room.participants.find((entry) => entry.id === "ana")?.isOwner).toBe(false);
  });

  it("ignores an unknown target", () => {
    const room = roomWith(draft("ana"));
    expect(transferOwnership(room, "ghost")).toBe(room);
  });
});

describe("removeParticipant", () => {
  it("removes the target from the room", () => {
    const room = removeParticipant(roomWith(draft("ana"), draft("bruno")), "bruno");
    expect(room.participants).toHaveLength(1);
  });

  it("passes ownership vacancy when the owner is removed", () => {
    const room = removeParticipant(roomWith(draft("ana"), draft("bruno")), "ana");
    expect(room.ownerId).toBeNull();
  });
});

describe("shouldRoomExpire", () => {
  it("is true when nobody joined", () => {
    expect(shouldRoomExpire(createRoom("r"))).toBe(true);
  });

  it("is true when everyone is disconnected", () => {
    const room = disconnectParticipant(roomWith(draft("ana")), "ana");
    expect(shouldRoomExpire(room)).toBe(true);
  });

  it("is false while somebody is connected", () => {
    expect(shouldRoomExpire(roomWith(draft("ana")))).toBe(false);
  });
});

describe("countConnected", () => {
  it("counts only connected participants", () => {
    let room = roomWith(draft("ana"), draft("bruno"));
    room = disconnectParticipant(room, "ana");
    expect(countConnected(room)).toBe(1);
  });

  it("returns zero for an empty room", () => {
    expect(countConnected(createRoom("r"))).toBe(0);
  });
});

describe("buildRevealEntries and tallyPoints", () => {
  it("maps votes to entries with points", () => {
    let room = roomWith(draft("ana"), draft("bruno"));
    room = castVote(room, "ana", "8");
    room = castVote(room, "bruno", "13");
    const entries = buildRevealEntries(room);
    expect(entries).toEqual([
      { participantId: "ana", name: "ana", role: "voter", vote: "8", points: 8 },
      { participantId: "bruno", name: "bruno", role: "voter", vote: "13", points: 13 },
    ]);
    expect(tallyPoints(entries)).toBe(21);
  });

  it("reports null points for the question mark", () => {
    let room = roomWith(draft("ana"));
    room = castVote(room, "ana", "?");
    const entries = buildRevealEntries(room);
    expect(entries[0]?.points).toBeNull();
    expect(tallyPoints(entries)).toBe(0);
  });

  it("reports null for someone who did not vote", () => {
    const entries = buildRevealEntries(roomWith(draft("ana")));
    expect(entries[0]?.vote).toBeNull();
    expect(entries[0]?.points).toBeNull();
  });

  it("includes spectators in the reveal", () => {
    const room = roomWith(draft("ana", { role: "spectator" }));
    expect(buildRevealEntries(room)[0]?.role).toBe("spectator");
  });

  it("sums to zero for an empty reveal", () => {
    expect(tallyPoints([])).toBe(0);
  });
});

describe("availableVotes", () => {
  it("mirrors the active deck", () => {
    const room = setDeck(roomWith(draft("ana")), "linear");
    expect(availableVotes(room)).toHaveLength(10);
  });
});

describe("deleteRoom", () => {
  it("returns null", () => {
    expect(deleteRoom(roomWith(draft("ana")))).toBeNull();
  });
});
/**
 * What a snapshot persisted before the chat field existed actually looks like
 * once JSON.parse has been through it: the key is simply not there.
 */
function legacyRoom(): Partial<RoomSnapshot> {
  const { messages: _messages, ...withoutMessages } = createRoom("abc");
  return withoutMessages;
}

describe("restoreRoom", () => {
  it("returns a fresh room when nothing is stored", () => {
    expect(restoreRoom(undefined, "abc").messages).toEqual([]);
  });

  it("returns a fresh room for a null snapshot", () => {
    expect(restoreRoom(null, "abc").id).toBe("abc");
  });

  it("backfills messages on a snapshot stored before the field existed", () => {
    expect(restoreRoom(legacyRoom(), "abc").messages).toEqual([]);
  });

  it("backfills when the stored field is explicitly undefined", () => {
    const legacy = { ...createRoom("abc") } as Record<string, unknown>;
    legacy.messages = undefined;

    expect(restoreRoom(legacy, "abc").messages).toEqual([]);
  });

  it("keeps the messages of a snapshot that has them", () => {
    const room = appendMessage(createRoom("abc"), {
      id: "m1",
      authorId: "p1",
      authorName: "Ana",
      text: "oi",
      sentAt: 1,
    });

    expect(restoreRoom(room, "abc").messages).toHaveLength(1);
  });

  it("keeps the participants and the round", () => {
    const room = joinRoom(createRoom("abc"), {
      id: "p1",
      token: "t1",
      name: "Ana",
      role: "voter",
      isOwner: true,
      isConnected: true,
    });

    const restored = restoreRoom(room, "abc");
    expect(restored.participants).toHaveLength(1);
    expect(restored.round).toBe(1);
  });

  it("drops a participants field that is not a list", () => {
    const broken = { ...createRoom("abc") } as Record<string, unknown>;
    broken.participants = "nope";

    expect(restoreRoom(broken, "abc").participants).toEqual([]);
  });

  it("produces a state the client accepts", () => {
    expect(isViewPayload(toPublicState(restoreRoom(legacyRoom(), "abc")))).toBe(true);
  });
});

describe("reclaimDisconnected", () => {
  function fullRoom() {
    return roomWith(
      ...Array.from({ length: MAX_PARTICIPANTS }, (_, index) => draft(`p${index}`)),
    );
  }

  it("leaves a room that is not full alone", () => {
    const room = roomWith(draft("ana"), draft("bruno"));
    const gone = disconnectParticipant(room, "bruno");

    expect(reclaimDisconnected(gone)).toBe(gone);
  });

  it("keeps the seat of someone who just left", () => {
    const gone = disconnectParticipant(fullRoom(), "p7");

    expect(reclaimDisconnected(gone).participants).toHaveLength(MAX_PARTICIPANTS);
  });

  it("frees the seat once the grace window has passed", () => {
    const gone = disconnectParticipant(fullRoom(), "p7");
    const later = Date.now() + GRACE_PERIOD_MS + 1;

    expect(reclaimDisconnected(gone, later).participants).toHaveLength(
      MAX_PARTICIPANTS - 1,
    );
  });

  it("takes the messages of the person it removed", () => {
    let room = appendMessage(fullRoom(), {
      id: "m1",
      authorId: "p7",
      authorName: "p7",
      text: "oi",
      sentAt: 1,
    });
    room = disconnectParticipant(room, "p7");

    expect(reclaimDisconnected(room, Date.now() + GRACE_PERIOD_MS + 1).messages).toEqual([]);
  });

  it("never reclaims the owner, even long past the window", () => {
    const gone = disconnectParticipant(fullRoom(), "p0");

    expect(reclaimDisconnected(gone, Date.now() + GRACE_PERIOD_MS + 1).ownerId).toBe("p0");
  });

  it("reclaims several stale seats at once", () => {
    let room = fullRoom();
    for (const id of ["p3", "p4", "p5"]) room = disconnectParticipant(room, id);

    const reclaimed = reclaimDisconnected(room, Date.now() + GRACE_PERIOD_MS + 1);
    expect(reclaimed.participants).toHaveLength(MAX_PARTICIPANTS - 3);
  });

  it("keeps someone who is still connected", () => {
    const room = fullRoom();
    const later = Date.now() + GRACE_PERIOD_MS + 1;

    expect(reclaimDisconnected(room, later)).toBe(room);
  });
});

describe("removal tombstones", () => {
  it("remembers the token so it cannot come back", () => {
    const room = roomWith(draft("ana"), draft("bruno"));

    expect(isRemovedToken(room, "token-bruno")).toBe(false);
    expect(isRemovedToken(removeParticipant(room, "bruno"), "token-bruno")).toBe(true);
  });

  it("leaves other tokens alone", () => {
    const room = removeParticipant(roomWith(draft("ana"), draft("bruno")), "bruno");

    expect(isRemovedToken(room, "token-ana")).toBe(false);
  });

  it("does not tombstone twice for the same person", () => {
    let room = roomWith(draft("ana"), draft("bruno"));
    room = removeParticipant(room, "bruno");

    expect(room.removedTokens).toHaveLength(1);
  });

  it("keeps only the most recent tombstones", () => {
    let room = createRoom("room");
    for (let index = 0; index < REMOVED_TOKEN_LIMIT + 10; index += 1) {
      room = joinRoom(room, draft(`p${index}`));
      room = removeParticipant(room, `p${index}`);
    }

    expect(room.removedTokens).toHaveLength(REMOVED_TOKEN_LIMIT);
  });

  it("backfills an absent tombstone list", () => {
    const { removedTokens: _removedTokens, ...legacy } = createRoom("room");

    expect(restoreRoom(legacy, "room").removedTokens).toEqual([]);
  });
});
