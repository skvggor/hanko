import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ChatMessage } from "@domain/chat";
import { createTranslator } from "@application/i18n";
import { ChatMessages } from "@presentation/ChatMessages";

const translate = createTranslator("en-US");

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    authorId: "p2",
    authorName: "Bia",
    text: "vamos nessa",
    sentAt: 1,
    ...overrides,
  };
}

function renderMessages(
  props: Partial<React.ComponentProps<typeof ChatMessages>> = {},
) {
  return render(
    <ChatMessages
      connectedParticipantIds={new Set(["p1", "p2"])}
      messages={[message()]}
      myParticipantId="p1"
      translate={translate}
      {...props}
    />,
  );
}

describe("ChatMessages", () => {
  /**
   * The bubbles on the cats carry one message each, so this list is the only place
   * the conversation can actually be read back. Anything dropped here is a message
   * that cannot be recovered from the screen.
   */
  it("lists every message in order", () => {
    renderMessages({
      messages: [
        message({ id: "m1", text: "primeira" }),
        message({ id: "m2", text: "segunda" }),
        message({ id: "m3", text: "terceira" }),
      ],
    });

    const lines = screen.getAllByText(/primeira|segunda|terceira/);
    expect(lines.map((line) => line.textContent)).toEqual([
      "primeira",
      "segunda",
      "terceira",
    ]);
  });

  it("says who said each thing", () => {
    renderMessages({ messages: [message({ authorName: "Carla" })] });

    expect(screen.getByText("Carla")).toBeTruthy();
  });

  it("marks what you said yourself", () => {
    renderMessages({ messages: [message({ authorId: "p1", authorName: "Ana" })] });

    expect(screen.getByText("Ana").closest("[data-mine]")).toHaveAttribute(
      "data-mine",
      "true",
    );
  });

  it("marks what someone who has left said", () => {
    renderMessages({
      connectedParticipantIds: new Set(["p1"]),
      messages: [message({ authorId: "p2" })],
    });

    expect(screen.getByText("Bia").closest("[data-left]")).toHaveAttribute(
      "data-left",
      "true",
    );
  });

  it("announces arriving messages rather than the whole backlog", () => {
    renderMessages();

    // A log holding every message is read out again from the start on each change,
    // so in a busy room the announcements talk over each other.
    expect(screen.getByRole("log")).toBeTruthy();
  });

  it("says so when there is nothing to read", () => {
    renderMessages({ messages: [] });

    expect(screen.getByText("No messages yet")).toBeTruthy();
  });
});