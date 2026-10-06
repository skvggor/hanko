import {
  MESSAGE_LIMIT,
  isChatMessage,
  isSendableMessage,
  normalizeMessageText,
} from "@domain/chat";
import {
  appendMessage,
  clearMessages,
  createRoom,
  joinRoom,
  leaveRoom,
  removeParticipant,
} from "@domain/room";

function roomWith(...names: string[]) {
  let room = createRoom("abc");
  names.forEach((name, index) => {
    room = joinRoom(room, {
      id: `p${index}`,
      token: `t${index}`,
      name,
      role: "voter",
      isOwner: index === 0,
      isConnected: true,
    });
  });
  return room;
}

function messageAt(index: number) {
  return {
    id: `m${index}`,
    authorId: "p0",
    authorName: "Ana",
    text: `hello ${index}`,
    sentAt: 1_700_000_000_000 + index,
  };
}

describe("appendMessage", () => {
  it("stores the message on the room", () => {
    const room = appendMessage(roomWith("Ana"), messageAt(0));

    expect(room.messages).toHaveLength(1);
    expect(room.messages[0]?.text).toBe("hello 0");
  });

  it("keeps messages in arrival order", () => {
    let room = roomWith("Ana");
    room = appendMessage(room, messageAt(0));
    room = appendMessage(room, messageAt(1));

    expect(room.messages.map((entry) => entry.id)).toEqual(["m0", "m1"]);
  });

  it("does not mutate the previous snapshot", () => {
    const before = roomWith("Ana");
    appendMessage(before, messageAt(0));

    expect(before.messages).toHaveLength(0);
  });

  it("keeps only the most recent messages", () => {
    let room = roomWith("Ana");
    for (let index = 0; index < MESSAGE_LIMIT + 20; index += 1) {
      room = appendMessage(room, messageAt(index));
    }

    expect(room.messages).toHaveLength(MESSAGE_LIMIT);
    expect(room.messages[0]?.id).toBe("m20");
    expect(room.messages.at(-1)?.id).toBe(`m${MESSAGE_LIMIT + 19}`);
  });
});

describe("clearMessages", () => {
  it("empties the conversation", () => {
    const room = clearMessages(appendMessage(roomWith("Ana"), messageAt(0)));

    expect(room.messages).toEqual([]);
  });

  it("keeps the participants", () => {
    const room = clearMessages(appendMessage(roomWith("Ana", "Bia"), messageAt(0)));

    expect(room.participants).toHaveLength(2);
  });

  it("returns the same snapshot when already empty", () => {
    const room = roomWith("Ana");

    expect(clearMessages(room)).toBe(room);
  });
});

describe("messages of removed participants", () => {
  it("drops them when the participant leaves", () => {
    let room = appendMessage(roomWith("Ana", "Bia"), messageAt(0));
    room = appendMessage(room, { ...messageAt(1), authorId: "p1", authorName: "Bia" });

    expect(room.messages).toHaveLength(2);

    room = leaveRoom(room, "p1");

    expect(room.messages).toHaveLength(1);
    expect(room.messages[0]?.authorId).toBe("p0");
  });

  it("drops them when the owner removes them", () => {
    let room = appendMessage(roomWith("Ana", "Bia"), messageAt(0));
    room = appendMessage(room, { ...messageAt(1), authorId: "p1", authorName: "Bia" });

    room = removeParticipant(room, "p1");

    expect(room.messages).toHaveLength(1);
  });

  it("keeps messages when someone reconnects", () => {
    const room = appendMessage(roomWith("Ana"), messageAt(0));

    expect(room.messages).toHaveLength(1);
  });
});

describe("normalizeMessageText", () => {
  it("trims the edges", () => {
    expect(normalizeMessageText("  hi  ")).toBe("hi");
  });

  it("collapses runs of whitespace into one space", () => {
    expect(normalizeMessageText("a \n\n  b")).toBe("a b");
  });

  it("caps the length", () => {
    expect(normalizeMessageText("x".repeat(400))).toHaveLength(280);
  });

  it("returns nothing for whitespace only", () => {
    expect(normalizeMessageText("   \n  ")).toBe("");
  });
});
describe("isSendableMessage", () => {
  it("accepts real text", () => {
    expect(isSendableMessage("oi")).toBe(true);
  });

  it("refuses whitespace only", () => {
    expect(isSendableMessage("  \n ")).toBe(false);
  });
});

describe("isChatMessage", () => {
  it("accepts a well formed message", () => {
    expect(
      isChatMessage({
        id: "m1",
        authorId: "p1",
        authorName: "Ana",
        text: "oi",
        sentAt: 1,
      }),
    ).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "oi"],
    ["a number", 7],
    ["a partial message", { text: "oi" }],
    ["a missing author", { id: "m1", authorName: "Ana", text: "oi", sentAt: 1 }],
    ["a missing timestamp", { id: "m1", authorId: "p1", authorName: "Ana", text: "oi" }],
    ["a non numeric timestamp", { id: "m1", authorId: "p1", authorName: "Ana", text: "oi", sentAt: "1" }],
  ])("refuses %s", (_label, value) => {
    expect(isChatMessage(value)).toBe(false);
  });
});
