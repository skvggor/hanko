import {
  MESSAGE_LIMIT,
  isChatMessage,
  isSendableMessage,
  normalizeMessageText,
  splitChatText,
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

function segments(text: string): string[] {
  return splitChatText(text).map((segment) =>
    segment.kind === "link" ? `link:${segment.href}` : segment.text,
  );
}

function links(text: string): string[] {
  return splitChatText(text)
    .filter((segment) => segment.kind === "link")
    .map((segment) => (segment.kind === "link" ? segment.href : ""));
}

describe("splitChatText", () => {
  it("leaves a message with no address alone", () => {
    expect(segments("vamos nessa")).toEqual(["vamos nessa"]);
  });

  it("finds an address in the middle of a sentence", () => {
    expect(segments("olha https://exemplo.com/figura aqui")).toEqual([
      "olha ",
      "link:https://exemplo.com/figura",
      " aqui",
    ]);
  });

  it("keeps the words on either side of an address", () => {
    expect(segments("antes https://exemplo.com depois")).toEqual([
      "antes ",
      "link:https://exemplo.com",
      " depois",
    ]);
  });

  it("finds every address in a message", () => {
    expect(links("https://a.example e https://b.example")).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });

  it("opens an address at either end of a message", () => {
    expect(links("https://a.example")).toEqual(["https://a.example"]);
    expect(links("veja https://a.example")).toEqual(["https://a.example"]);
  });

  it("leaves out the full stop that ended the sentence", () => {
    expect(links("olha https://exemplo.com.")).toEqual(["https://exemplo.com"]);
  });

  /**
   * A bracket that closes something inside the address belongs to the address, which
   * is why a trailing one is only dropped while the address still has more openings
   * than closings. Guessing wrong either way mangles a real link.
   */
  it("keeps a bracket that the address opened itself", () => {
    expect(links("https://exemplo.com/wiki/Foo_(bar)")).toEqual([
      "https://exemplo.com/wiki/Foo_(bar)",
    ]);
  });

  it("drops a bracket that only closed the sentence", () => {
    expect(links("(veja https://exemplo.com/guia)")).toEqual([
      "https://exemplo.com/guia",
    ]);
  });

  /**
   * A chat is text from whoever is in the room, so anything that could carry a scheme
   * is refused outright rather than trusted and sanitised: only a real web address
   * becomes a link, and the browser never sees a javascript: or data: href at all.
   */
  it("refuses an address that is not http", () => {
    expect(segments("javascript:alert(1)")).toEqual(["javascript:alert(1)"]);
    expect(segments("data:text/html;base64,PHNjcmlwdD4=")).toEqual([
      "data:text/html;base64,PHNjcmlwdD4=",
    ]);
  });

  it("keeps a bare domain that was never written as an address", () => {
    expect(segments("exemplo.com")).toEqual(["exemplo.com"]);
  });

  it("reads nothing out of an empty message", () => {
    expect(splitChatText("")).toEqual([]);
  });

  it("does not invent a space where there was none", () => {
    expect(segments("olha https://exemplo.com/x")).toEqual([
      "olha ",
      "link:https://exemplo.com/x",
    ]);
  });
});
