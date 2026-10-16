import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatMessage } from "@domain/chat";
import { createTranslator } from "@application/i18n";
import { ChatTranscript } from "@presentation/ChatTranscript";

const translate = createTranslator("en-US");

function line(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    authorId: "p2",
    authorName: "Bia",
    text: "vamos nessa",
    sentAt: 1,
    ...overrides,
  };
}

function renderTranscript(messages: ChatMessage[] = []) {
  return render(
    <ChatTranscript
      connectedParticipantIds={new Set(["p1", "p2"])}
      messages={messages}
      myParticipantId="p1"
      translate={translate}
    />,
  );
}

function warningNode(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-role="warning"]');
}

describe("ChatTranscript", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
  });

  it("offers to read the conversation rather than assuming anybody wants to", () => {
    renderTranscript();

    expect(screen.getByRole("button", { name: "Read the conversation" })).toBeTruthy();
  });

  it("shows nothing until the conversation is asked for", () => {
    renderTranscript([line({ text: "primeira" })]);

    expect(screen.queryByText("primeira")).toBeNull();
  });

  it("reads back everything once opened", async () => {
    renderTranscript([
      line({ id: "m1", text: "primeira" }),
      line({ id: "m2", text: "segunda" }),
      line({ id: "m3", text: "terceira" }),
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Read the conversation" }));

    expect(screen.getByText("primeira")).toBeTruthy();
    expect(screen.getByText("segunda")).toBeTruthy();
    expect(screen.getByText("terceira")).toBeTruthy();
  });

  it("closes again without taking the reading away for good", async () => {
    renderTranscript([line()]);

    await userEvent.click(screen.getByRole("button", { name: "Read the conversation" }));
    await userEvent.click(screen.getByRole("button", { name: "Close the conversation" }));

    expect(screen.queryByText("vamos nessa")).toBeNull();
    expect(screen.getByRole("button", { name: "Read the conversation" })).toBeTruthy();
  });

  it("never has two live regions at the same time", async () => {
    renderTranscript([line()]);

    expect(screen.getAllByRole("log")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Read the conversation" }));

    expect(screen.getAllByRole("log")).toHaveLength(1);
  });

});

describe("ChatTranscript and the warning about what chat is", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
  });

  /**
   * The room id is the only secret there is, and nothing in the room is encrypted, so
   * a warning that leaves it to imagination is a warning nobody is warned by. It says
   * what is true about the room rather than what would be nice to say.
   */
  it("says out loud that the room is not private", async () => {
    const { container } = renderTranscript();

    await userEvent.click(screen.getByRole("button", { name: "Read the conversation" }));

    const notice = warningNode(container);
    expect(notice?.textContent).toContain("not private");
    expect(notice?.textContent).toContain("not encrypted");
  });

  it("tells the reader not to put confidential or unlawful information here", async () => {
    const { container } = renderTranscript();

    await userEvent.click(screen.getByRole("button", { name: "Read the conversation" }));

    expect(warningNode(container)?.textContent).toContain("confidential");
  });

  it("warns once rather than at every opening", async () => {
    const { container } = renderTranscript();

    await userEvent.click(screen.getByRole("button", { name: "Read the conversation" }));
    await userEvent.click(warningNode(container)?.querySelector("button") as HTMLElement);
    await userEvent.click(screen.getByRole("button", { name: "Close the conversation" }));
    await userEvent.click(screen.getByRole("button", { name: "Read the conversation" }));

    expect(warningNode(container)).toBeNull();
  });

  it("does not warn someone who has already read it", async () => {
    globalThis.localStorage?.setItem("hanko:chat-warning", "read");

    const { container } = renderTranscript();
    await userEvent.click(screen.getByRole("button", { name: "Read the conversation" }));

    expect(warningNode(container)).toBeNull();
  });

  it("says the warning out rather than only showing it", async () => {
    const { container } = renderTranscript();

    await userEvent.click(screen.getByRole("button", { name: "Read the conversation" }));

    // A warning nobody is told is not a warning. It appears because the reader asked
    // for the conversation, and it has to reach them without them having to go
    // looking for it.
    expect(warningNode(container)?.getAttribute("aria-live")).toBe("polite");
  });
});