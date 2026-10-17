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
  disconnectParticipant,
  findByToken,
  joinRoom,
  leaveRoom,
  restoreRoom,
  reconnectParticipant,
  reclaimDisconnected,
  isRemovedToken,
  removeCat,
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

type DraftParticipant = Omit<Participant, "vote" | "disconnectedAt" | "hasCat">;

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
      hasCat: true,
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

  it("gives already sent messages the new name", () => {
    let room = roomWith(draft("ana"), draft("bruno"));
    room = appendMessage(room, {
      id: "m1",
      authorId: "ana",
      authorName: "ana",
      text: "hello",
      sentAt: 1,
    });
    room = appendMessage(room, {
      id: "m2",
      authorId: "bruno",
      authorName: "bruno",
      text: "hi",
      sentAt: 2,
    });

    const renamed = setParticipantName(room, "ana", "Ana Maria");

    expect(renamed.messages[0]?.authorName).toBe("Ana Maria");
    expect(renamed.messages[1]?.authorName).toBe("bruno");
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

  /**
   * Pushes a dropped seat back past the window without waiting five minutes for it,
   * so the tests can put three people at three different ages in one room.
   */
  function ageOut(room: RoomSnapshot, participantId: string): RoomSnapshot {
    return {
      ...room,
      participants: room.participants.map((entry) =>
        entry.id === participantId && entry.disconnectedAt !== null
          ? { ...entry, disconnectedAt: entry.disconnectedAt - GRACE_PERIOD_MS - 1000 }
          : entry,
      ),
    };
  }

  /**
   * Read at call time rather than at import: disconnectParticipant stamps the moment
   * of the drop, and a clock fixed before it ran would put the deadline in the past
   * of a seat that had not been given up yet.
   */
  const wellPastTheWindow = () => Date.now() + GRACE_PERIOD_MS + 1;

  it("changes nothing while everybody is still connected", () => {
    const room = fullRoom();

    expect(reclaimDisconnected(room, wellPastTheWindow())).toBe(room);
  });

  it("keeps the seat of someone who just left", () => {
    const gone = disconnectParticipant(fullRoom(), "p7");

    expect(reclaimDisconnected(gone).participants).toHaveLength(MAX_PARTICIPANTS);
  });

  it("frees the seat once the grace window has passed", () => {
    const gone = disconnectParticipant(fullRoom(), "p7");

    expect(reclaimDisconnected(gone, wellPastTheWindow()).participants).toHaveLength(
      MAX_PARTICIPANTS - 1,
    );
  });

  /**
   * The rule used to be that a room below the cap was left alone, on the reasoning
   * that a seat costs nothing until it blocks somebody. It does cost something: a room
   * where somebody dropped carried their ghost in the list for the rest of its life,
   * because the only thing that ever called this was a new arrival.
   */
  it("frees the seat in a room that is nowhere near full", () => {
    const room = roomWith(draft("ana"), draft("bruno"));
    const gone = disconnectParticipant(room, "bruno");

    expect(reclaimDisconnected(gone, wellPastTheWindow()).participants).toHaveLength(1);
  });

  /**
   * The seat is what gets reclaimed. What somebody said is not, because the whole
   * point of a readable transcript is that a person who leaves still said it, and a
   * five minute network drop is not a retraction.
   */
  it("keeps what the person said", () => {
    let room = appendMessage(fullRoom(), {
      id: "m1",
      authorId: "p7",
      authorName: "p7",
      text: "oi",
      sentAt: 1,
    });
    room = disconnectParticipant(room, "p7");

    expect(reclaimDisconnected(room, wellPastTheWindow()).messages).toHaveLength(1);
  });

  it("reclaims several stale seats at once", () => {
    let room = fullRoom();
    for (const id of ["p3", "p4", "p5"]) room = disconnectParticipant(room, id);

    expect(reclaimDisconnected(room, wellPastTheWindow()).participants).toHaveLength(
      MAX_PARTICIPANTS - 3,
    );
  });

  /**
   * The owner used to be exempt, so a host who dropped stayed in the list forever and
   * the room had a name on it that nobody could answer to. Handing the room to somebody
   * in it is better than keeping a ghost, and better than leaving nobody in charge.
   */
  it("hands the room to somebody still in it when the owner is the one who goes", () => {
    const gone = disconnectParticipant(fullRoom(), "p0");

    const reclaimed = reclaimDisconnected(gone, wellPastTheWindow());

    expect(reclaimed.ownerId).toBe("p1");
    expect(reclaimed.participants.find((entry) => entry.id === "p1")?.isOwner).toBe(true);
  });

  /**
   * A person inside their grace window is still seated, so taking the room from
   * somebody who is quietly reconnecting and giving it to a stranger already here
   * would be the worse betrayal.
   */
  it("prefers somebody who is connected over somebody who may yet come back", () => {
    let room = roomWith(draft("ana"), draft("bruno"), draft("carla"));
    room = ageOut(disconnectParticipant(room, "ana"), "ana");
    room = disconnectParticipant(room, "bruno");

    // Ana is well past the window and goes. Bruno is only moments gone, so he survives
    // and is still seated ahead of Carla, but Carla is the one who is actually here.
    const reclaimed = reclaimDisconnected(room, Date.now() + 1);

    expect(reclaimed.participants.map((entry) => entry.id)).toEqual(["bruno", "carla"]);
    expect(reclaimed.ownerId).toBe("carla");
  });

  it("leaves the room without an owner when nobody is left in it", () => {
    const room = disconnectParticipant(roomWith(draft("ana")), "ana");

    const reclaimed = reclaimDisconnected(room, wellPastTheWindow());

    expect(reclaimed.participants).toHaveLength(0);
    expect(reclaimed.ownerId).toBeNull();
  });

  it("takes the vote of somebody it removed with them", () => {
    const room = castVote(fullRoom(), "p7", "5");
    const gone = disconnectParticipant(room, "p7");

    const reclaimed = reclaimDisconnected(gone, wellPastTheWindow());

    expect(reclaimed.participants.some((entry) => entry.id === "p7")).toBe(false);
    expect(
      buildRevealEntries(reclaimed).some((entry) => entry.participantId === "p7"),
    ).toBe(false);
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

describe("removeCat", () => {
  function roomWithTwoCats() {
    const started = createRoom("abc");
    const withAna = joinRoom(started, {
      id: "p1",
      token: "t1",
      name: "Ana",
      role: "voter",
      isOwner: true,
      isConnected: true,
    });
    return joinRoom(withAna, {
      id: "p2",
      token: "t2",
      name: "Bruno",
      role: "voter",
      isOwner: false,
      isConnected: true,
    });
  }

  it("gives everybody a cat to begin with", () => {
    const room = roomWithTwoCats();

    expect(room.participants.every((participant) => participant.hasCat)).toBe(true);
  });

  it("takes the cat away", () => {
    const room = removeCat(roomWithTwoCats(), "p1");

    expect(room.participants.find((entry) => entry.id === "p1")?.hasCat).toBe(false);
  });

  it("leaves everybody else's cat alone", () => {
    const room = removeCat(roomWithTwoCats(), "p1");

    expect(room.participants.find((entry) => entry.id === "p2")?.hasCat).toBe(true);
  });

  it("changes nothing the second time, and says so by returning the same room", () => {
    const room = removeCat(roomWithTwoCats(), "p1");

    expect(removeCat(room, "p1")).toBe(room);
  });

  it("does nothing for a participant who is not in the room", () => {
    const room = roomWithTwoCats();

    expect(removeCat(room, "nobody")).toBe(room);
  });

  it("keeps the seat, the vote and the name of somebody whose cat is gone", () => {
    const room = removeCat(roomWithTwoCats(), "p1");
    const ana = room.participants.find((entry) => entry.id === "p1");

    expect(ana?.name).toBe("Ana");
    expect(ana?.isOwner).toBe(true);
    expect(ana?.isConnected).toBe(true);
  });

  /**
   * A room stored before this field existed has to come back with a cat rather than
   * with nothing, or everyone who was already in a room would lose theirs on upgrade.
   */
  it("gives a cat back to a participant stored before the field existed", () => {
    // Built as the storage of an older room would hold it, which is a snapshot that
    // simply has no such field rather than one holding false.
    const legacy = {
      ...roomWithTwoCats(),
      participants: roomWithTwoCats().participants.map(({ hasCat: _hasCat, ...rest }) => rest),
    } as Partial<RoomSnapshot>;

    const room = restoreRoom(legacy, "abc");

    expect(room.participants.every((participant) => participant.hasCat)).toBe(true);
  });
});

/**
 * A reveal is a moment the room read together. A number that moves five minutes later,
 * under people who are still talking about it, because somebody's connection dropped
 * and their seat was freed, is not a correction: it is the room quietly rewriting a
 * record everybody has already seen. So the numbers are kept as they were shown.
 */
describe("a revealed tally that stays put", () => {
  function revealedRoom() {
    const room = roomWith(draft("ana"), draft("bruno"), draft("carla"));
    return reveal(
      castVote(castVote(castVote(room, "ana", "5"), "bruno", "8"), "carla", "13"),
    );
  }

  it("shows what everybody voted when the reveal happens", () => {
    const state = toPublicState(revealedRoom());

    expect(state.totalPoints).toBe(26);
    expect(state.reveals).toHaveLength(3);
  });

  it("keeps showing those numbers after a seat is freed", () => {
    let room = revealedRoom();
    room = disconnectParticipant(room, "bruno");
    room = reclaimDisconnected(
      room,
      Date.now() + GRACE_PERIOD_MS + 1,
    );

    expect(room.participants).toHaveLength(2);

    const state = toPublicState(room);
    expect(state.totalPoints).toBe(26);
    expect(state.reveals?.map((entry) => entry.name)).toEqual(["ana", "bruno", "carla"]);
  });

  it("still counts somebody who never voted", () => {
    const room = reveal(castVote(roomWith(draft("ana"), draft("bruno")), "ana", "5"));

    expect(toPublicState(room).totalPoints).toBe(5);
  });

  it("starts the numbers again on the next round", () => {
    const room = startNextRound(revealedRoom());

    expect(room.isRevealed).toBe(false);
    expect(toPublicState(room).reveals).toBeNull();
    expect(toPublicState(room).totalPoints).toBeNull();
  });

  it("starts them again on a reset", () => {
    const room = resetRound(revealedRoom());

    expect(toPublicState(room).reveals).toBeNull();
    expect(toPublicState(room).totalPoints).toBeNull();
  });

  it("shows nothing at all before anybody reveals", () => {
    const state = toPublicState(castVote(roomWith(draft("ana")), "ana", "5"));

    expect(state.reveals).toBeNull();
    expect(state.totalPoints).toBeNull();
  });

  /**
   * A room stored before this field existed is revealed on somebody's screen, and the
   * reveal is one click away. Reading the field as missing would mean showing nothing at
   * all until the round restarted.
   */
  it("rebuilds the numbers for a room stored before the field existed", () => {
    const room = revealedRoom();
    const { revealedEntries: _dropped, ...legacy } = room as Partial<RoomSnapshot>;
    const restored = restoreRoom({ ...legacy, isRevealed: true }, "abc");

    expect(toPublicState(restored).totalPoints).toBe(26);
  });
});
