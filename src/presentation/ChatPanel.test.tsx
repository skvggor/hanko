import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatMessage } from "@domain/chat";
import { createTranslator } from "@application/i18n";
import { ChatPanel } from "@presentation/ChatPanel";

const translate = createTranslator("en-US");

function useNarrowScreen(): void {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
}

function useWideScreen(): void {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("min-width") }));
}

beforeEach(() => useWideScreen());
afterEach(() => vi.unstubAllGlobals());

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    authorId: "p1",
    authorName: "Ana",
    text: "vamos nessa",
    sentAt: 1_700_000_000_000,
    ...overrides,
  };
}

function renderPanel(
  props: Partial<React.ComponentProps<typeof ChatPanel>> = {},
) {
  const onClear = vi.fn();
  const onSend = vi.fn();

  const result = render(
    <ChatPanel
      connectedParticipantIds={new Set(["p1", "p2"])}
      isOwner={false}
      messages={[]}
      myParticipantId="p1"
      onClear={onClear}
      onSend={onSend}
      translate={translate}
      {...props}
    />,
  );

  return { onClear, onSend, ...result };
}

describe("ChatPanel", () => {
  it("collapses by default on a narrow screen", () => {
    useNarrowScreen();
    renderPanel();

    expect(screen.getByRole("button", { name: "Open chat" })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("opens on a wide screen", () => {
    renderPanel();

    expect(screen.getByRole("textbox")).toBeTruthy();

  });

  it("opens when the launcher is clicked", async () => {
    useNarrowScreen();
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Open chat" }));

    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("shows a placeholder when there is nothing said", () => {
    renderPanel();

    expect(screen.getByText("No messages yet")).toBeTruthy();

  });

  it("lists messages with their author", () => {
    renderPanel({
      messages: [message(), message({ id: "m2", authorId: "p2", authorName: "Bia", text: "eu topo" })],
    });

    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.getByText("vamos nessa")).toBeTruthy();
    expect(screen.getByText("Bia")).toBeTruthy();

  });

  it("sends the draft", async () => {
    const { onSend } = renderPanel();

    await userEvent.type(screen.getByRole("textbox"), "oi pessoal");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSend).toHaveBeenCalledWith("oi pessoal");

  });

  it("empties the draft after sending", async () => {
    renderPanel();

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "oi");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("");

  });

  it("keeps the send disabled while the draft is blank", () => {
    renderPanel();

    const send = screen.getByRole<HTMLButtonElement>("button", { name: "Send message" });
    expect(send.disabled).toBe(true);

  });

  it("hides the clear button from non owners", () => {
    renderPanel({ messages: [message()], isOwner: false });

    expect(screen.queryByRole("button", { name: "Clear the conversation" })).toBeNull();

  });

  it("lets the owner clear the conversation", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("min-width") }));
    const { onClear } = renderPanel({ messages: [message()], isOwner: true });

    await userEvent.click(screen.getByRole("button", { name: "Clear the conversation" }));

    expect(onClear).toHaveBeenCalledTimes(1);

  });

  it("minimizes back to the launcher", async () => {
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Minimize chat" }));

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Open chat" })).toBeTruthy();

  });

  it("counts what arrived while minimized", async () => {
    useNarrowScreen();
    const props = {
      connectedParticipantIds: new Set(["p1"]),
      isOwner: false,
      messages: [message()],
      myParticipantId: "p1",
      onClear: vi.fn(),
      onSend: vi.fn(),
      translate,
    };
    const { rerender } = render(<ChatPanel {...props} />);

    await userEvent.click(screen.getByRole("button", { name: "Open chat" }));
    await userEvent.click(screen.getByRole("button", { name: "Minimize chat" }));

    rerender(<ChatPanel {...props} messages={[message(), message({ id: "m2" }), message({ id: "m3" })]} />);

    expect(screen.getByRole("button", { name: "Open chat, 2 unread" })).toBeTruthy();
  });

  it("clears the unread count once reopened", async () => {
    useNarrowScreen();
    const props = {
      connectedParticipantIds: new Set(["p1"]),
      isOwner: false,
      messages: [message()],
      myParticipantId: "p1",
      onClear: vi.fn(),
      onSend: vi.fn(),
      translate,
    };
    const { rerender } = render(<ChatPanel {...props} />);

    await userEvent.click(screen.getByRole("button", { name: "Open chat" }));
    await userEvent.click(screen.getByRole("button", { name: "Minimize chat" }));
    rerender(<ChatPanel {...props} messages={[message(), message({ id: "m2" })]} />);

    await userEvent.click(screen.getByRole("button", { name: "Open chat, 1 unread" }));

    await userEvent.click(screen.getByRole("button", { name: "Minimize chat" }));

    expect(screen.getByRole("button", { name: "Open chat" })).toBeTruthy();
  });

  it("marks messages from someone who already left", () => {
    const { container } = renderPanel({
      messages: [message({ id: "gone" }), message({ id: "here", authorId: "p2" })],
      connectedParticipantIds: new Set(["p2"]),
    });

    const lines = container.querySelectorAll(".chat-line");
    expect(lines[0]?.getAttribute("data-left")).toBe("true");
    expect(lines[1]?.getAttribute("data-left")).toBe("false");

  });

  it("marks its own messages", () => {
    const { container } = renderPanel({ messages: [message()], myParticipantId: "p1" });

    expect(container.querySelector(".chat-line")?.getAttribute("data-mine")).toBe("true");

  });
});