import { act, render, screen, waitFor } from "@testing-library/react";
import { createTranslator } from "@application/i18n";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomScreen } from "@presentation/RoomScreen";

const harness = vi.hoisted(() => ({
  sockets: [] as Array<Record<string, unknown>>,
  joinCalls: [] as unknown[],
  sent: [] as unknown[],
  roomDeleted: false,
  errors: [] as string[],
}));

vi.mock("@application/roomConnection", () => ({
  RoomConnection: class {
    participantId = "p1";
    token: string | null = null;

    constructor(public roomId: string) {
      harness.sockets.push(this as unknown as Record<string, unknown>);
    }

    #record(message: unknown) {
      harness.sent.push(message);
    }

    async join(name: string, role: string, token: string | null) {
      harness.joinCalls.push({ name, role, token });
      this.token = "token-1";
    }

    listener: ((state: unknown) => void) | null = null;
    errorListener: ((code: string) => void) | null = null;
    deletedListener: (() => void) | null = null;

    subscribe(listener: (state: unknown) => void) {
      this.listener = listener;
      return () => {};
    }

    onError(listener: (code: string) => void) {
      this.errorListener = listener;
      return () => {};
    }

    onDeleted(listener: () => void) {
      this.deletedListener = listener;
      return () => {};
    }
    chatListener: ((message: unknown) => void) | null = null;

    onChatMessage(listener: (message: unknown) => void) {
      this.chatListener = listener;
      return () => {};
    }
    removedListener: (() => void) | null = null;

    onRemoved(listener: () => void) {
      this.removedListener = listener;
      return () => {};
    }

    onConnectionChange() {
      return () => {};
    }

    vote(value: string) {
      this.#record({ type: "vote", value });
    }
    reveal() {
      this.#record({ type: "reveal" });
    }
    nextRound() {
      this.#record({ type: "next-round" });
    }
    resetRound() {
      this.#record({ type: "reset-round" });
    }
    setDeck(deckId: string) {
      this.#record({ type: "set-deck", deckId });
    }
    setRole(participantId: string, role: string) {
      this.#record({ type: "set-role", participantId, role });
    }
    rename(name: string) {
      this.#record({ type: "set-name", name });
    }
    transferOwnership(participantId: string) {
      this.#record({ type: "transfer-ownership", participantId });
    }
    removeParticipant(participantId: string) {
      this.#record({ type: "remove-participant", participantId });
    }
    deleteRoom() {
      this.#record({ type: "delete-room" });
    }
    setRoomName(name: string | null) {
      this.#record({ type: "set-room-name", name });
    }
    sendMessage(text: string) {
      this.#record({ type: "chat", text });
    }
    clearMessages() {
      this.#record({ type: "clear-chat" });
    }
    ping() {}
    close() {}
  },
}));

interface MockConnection {
  listener: ((state: unknown) => void) | null;
  errorListener: ((code: string) => void) | null;
  deletedListener: (() => void) | null;
  chatListener: ((message: unknown) => void) | null;
  removedListener: (() => void) | null;
}

function currentConnection(): MockConnection | undefined {
  return harness.sockets.at(-1) as MockConnection | undefined;
}

function pushState(state: unknown) {
  act(() => {
    currentConnection()?.listener?.(state);
  });
}

function pushError(code: string) {
  act(() => {
    currentConnection()?.errorListener?.(code);
  });
}

function pushChat(message: unknown) {
  act(() => {
    currentConnection()?.chatListener?.(message);
  });
}

function pushRemoved() {
  act(() => {
    currentConnection()?.removedListener?.();
  });
}

function pushDeleted() {
  act(() => {
    currentConnection()?.deletedListener?.();
  });
}

const roomState = {
  id: "room-1",
  deckId: "fibonacci",
  round: 1,
  isRevealed: false,
  participants: [
    { id: "p1", name: "Ana", role: "voter", isOwner: true, isConnected: true, hasVoted: false },
  ],
  ownerId: "p1",
  gracePeriodMs: 300_000,
  connectedCount: 1,
  reveals: null,
  totalPoints: null,
  myVote: null,
  messages: [],
  name: null,
};

function renderRoom() {
  return render(
    <RoomScreen roomId="room-1" translate={createTranslator("en-US")} />,
  );
}

async function joinAs(name: string) {
  await userEvent.type(screen.getByLabelText("Your name"), name);
  await userEvent.click(screen.getByRole("button", { name: "Enter" }));
}

describe("RoomScreen", () => {
  beforeEach(() => {
    harness.sockets.length = 0;
    harness.joinCalls.length = 0;
    harness.sent.length = 0;
    harness.errors.length = 0;

    vi.stubGlobal("location", {
      origin: "https://hanko.pages.dev",
      pathname: "/room/room-1",
      protocol: "https:",
    });
    vi.stubGlobal("navigator", { language: "en-US" });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks for a name before connecting to a room", () => {
    renderRoom();
    expect(screen.getByText("What is your name?")).toBeTruthy();
    expect(harness.joinCalls).toHaveLength(0);
  });

  it("joins with the chosen name", async () => {
    renderRoom();

    await userEvent.type(screen.getByLabelText("Your name"), "Ana");
    await userEvent.click(screen.getByRole("button", { name: "Enter" }));

    await waitFor(() => {
      expect(harness.joinCalls).toEqual([
        { name: "Ana", role: "voter", token: null },
      ]);
    });
  });

  it("remembers the name for the next visit", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem });
    vi.stubGlobal("sessionStorage", { getItem: vi.fn(() => null), setItem });

    renderRoom();
    await joinAs("Ana");

    await waitFor(() => {
      expect(setItem).toHaveBeenCalledWith("hanko:name:room-1", "Ana");
    });
  });

  it("prefills the stored name", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "Bruno"),
      setItem: vi.fn(),
    });
    vi.stubGlobal("sessionStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });

    renderRoom();

    const input: HTMLInputElement = screen.getByLabelText("Your name");
    expect(input.value).toBe("Bruno");
  });

  it("reuses the token stored for this tab", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn(() => "stored-token"),
      setItem: vi.fn(),
    });
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });

    renderRoom();
    await joinAs("Ana");

    await waitFor(() => {
      expect(harness.joinCalls[0]).toMatchObject({ token: "stored-token" });
    });
  });

  it("shows the board once the room state arrives", async () => {
    renderRoom();
    await joinAs("Ana");

    await waitFor(() => {
      expect(harness.joinCalls).toHaveLength(1);
    });

    pushState(roomState);

    expect(await screen.findByText("Round 1")).toBeTruthy();
    expect(screen.getByText("1 here")).toBeTruthy();
  });

  it("forwards a vote to the connection", async () => {
    renderRoom();
    await joinAs("Ana");
    await waitFor(() => expect(harness.joinCalls).toHaveLength(1));

    pushState(roomState);
    await userEvent.click(screen.getByRole("button", { name: "Vote 8" }));

    expect(harness.sent).toContainEqual({ type: "vote", value: "8" });
  });

  it("forwards the reveal to the connection", async () => {
    renderRoom();
    await joinAs("Ana");
    await waitFor(() => expect(harness.joinCalls).toHaveLength(1));

    pushState(roomState);
    await userEvent.click(screen.getByRole("button", { name: "Reveal" }));

    expect(harness.sent).toContainEqual({ type: "reveal" });
  });

  it("surfaces a server error", async () => {
    renderRoom();
    await joinAs("Ana");
    await waitFor(() => expect(harness.joinCalls).toHaveLength(1));

    pushError("not_owner");

    expect(await screen.findByText("Only the room owner can do this")).toBeTruthy();
  });

  it("surfaces room deletion", async () => {
    renderRoom();
    await joinAs("Ana");
    await waitFor(() => expect(harness.joinCalls).toHaveLength(1));

    pushDeleted();

    expect(await screen.findByText("This room was deleted")).toBeTruthy();
  });





  it("renders the room link without the scheme", async () => {
    renderRoom();
    await joinAs("Ana");
    await waitFor(() => expect(harness.joinCalls).toHaveLength(1));

    pushState(roomState);

    expect(await screen.findByText("hanko.pages.dev")).toBeTruthy();
  });

  describe("chat beside the estimate panel", () => {
    async function openChat() {
      await userEvent.click(screen.getByRole("button", { name: "Open chat" }));
      return screen.getByRole("textbox", { name: "Say something" });
    }

    it("keeps the estimate panel mounted while typing", async () => {
      renderRoom();
      await joinAs("Ana");
      pushState(roomState);

      const input = await openChat();
      const before = screen.getByText("Your estimate").closest("div");

      await userEvent.type(input, "hello");

      expect(screen.getByText("Your estimate").closest("div")).toBe(before);
    });

    it("does not restart the stamp animation when a message is sent", async () => {
      const { container } = renderRoom();
      await joinAs("Ana");
      pushState({ ...roomState, myVote: "8" });

      const input = await openChat();
      const sealBefore = container.querySelector("[data-seal]");

      await userEvent.type(input, "oi{Enter}");

      expect(container.querySelector("[data-seal]")).toBe(sealBefore);
    });

    it("does not flip the seal phase when a message is sent", async () => {
      // The blink is the stamp replaying its press animation: a fresh mount resets
      // the drying timer, so data-phase goes back to wet and the ink re-bleeds.
      const { container } = renderRoom();
      await joinAs("Ana");
      pushState({ ...roomState, myVote: "8" });

      const input = await openChat();
      const seal = () => container.querySelector("[data-phase]");
      const before = seal();
      expect(before?.getAttribute("data-phase")).not.toBeNull();

      await userEvent.type(input, "oi{Enter}");

      expect(seal()).toBe(before);
      expect(seal()?.getAttribute("data-phase")).toBe(
        before?.getAttribute("data-phase"),
      );
      expect(container.querySelector("[data-seal]")?.className).toBe(
        before?.querySelector("[data-seal]")?.className,
      );
    });

    it("survives the state broadcast the server sends after a message", async () => {
      // This is the real sequence: send, the server rebroadcasts the whole room,
      // and the client swaps in a brand new PublicRoomState object.
      const { container } = renderRoom();
      await joinAs("Ana");
      pushState({ ...roomState, myVote: "8" });

      const input = await openChat();
      const seal = container.querySelector("[data-phase]");
      const phase = seal?.getAttribute("data-phase");

      await userEvent.type(input, "oi{Enter}");
      pushState({
        ...roomState,
        myVote: "8",
        messages: [
          { id: "m1", authorId: "p1", authorName: "Ana", text: "oi", sentAt: 1 },
        ],
      });

      expect(container.querySelector("[data-phase]")).toBe(seal);
      expect(container.querySelector("[data-phase]")?.getAttribute("data-phase")).toBe(phase);
    });

    it("produces identical markup when another person sends a message", async () => {
      const { container } = renderRoom();
      await joinAs("Ana");
      pushState({
        ...roomState,
        myVote: "8",
        participants: [
          { id: "p1", name: "Ana", role: "voter", isOwner: true, isConnected: true, hasVoted: true },
          { id: "p2", name: "Bia", role: "voter", isOwner: false, isConnected: true, hasVoted: false },
        ],
        connectedCount: 2,
      });

      const hanko = () =>
        screen.getByText("Your estimate").closest("div")?.parentElement?.parentElement;

      const before = hanko()?.outerHTML;

      // Bia sends; the server rebroadcasts the room to everyone, including me.
      pushState({
        ...roomState,
        myVote: "8",
        participants: [
          { id: "p1", name: "Ana", role: "voter", isOwner: true, isConnected: true, hasVoted: true },
          { id: "p2", name: "Bia", role: "voter", isOwner: false, isConnected: true, hasVoted: false },
        ],
        connectedCount: 2,
        messages: [
          { id: "m1", authorId: "p2", authorName: "Bia", text: "oi", sentAt: 1 },
        ],
      });

      expect(hanko()).not.toBeNull();
      expect(hanko()?.outerHTML).toBe(before);
      expect(container.querySelector("[data-phase]")?.getAttribute("data-phase")).toBe("wet");
    });

    it("stops showing the room once the owner removes you", async () => {
      renderRoom();
      await joinAs("Ana");
      pushState(roomState);

      expect(screen.getByText("Your estimate")).toBeTruthy();

      pushRemoved();

      expect(screen.queryByText("Your estimate")).toBeNull();
      expect(screen.getByText("You were removed from this room")).toBeTruthy();
    });

    it("does not re-render the estimate panel when another person speaks", async () => {
      // The bug: a chat message used to be answered with a full PublicRoomState
      // broadcast, so every client swapped in a new state object and the whole
      // board re-rendered. Chat now arrives on its own frame and only the message
      // list changes.
      renderRoom();
      await joinAs("Ana");
      pushState({
        ...roomState,
        myVote: "8",
        participants: [
          { id: "p1", name: "Ana", role: "voter", isOwner: true, isConnected: true, hasVoted: true },
          { id: "p2", name: "Bia", role: "voter", isOwner: false, isConnected: true, hasVoted: false },
        ],
        connectedCount: 2,
      });

      const panel = screen.getByText("Your estimate").closest("div");

      pushChat({ id: "m1", authorId: "p2", authorName: "Bia", text: "oi", sentAt: 1 });

      expect(screen.getByText("Your estimate").closest("div")).toBe(panel);
    });

    it("still shows the message that arrived on the chat frame", async () => {
      renderRoom();
      await joinAs("Ana");
      pushState(roomState);

      await userEvent.click(screen.getByRole("button", { name: "Open chat" }));
      pushChat({ id: "m1", authorId: "p2", authorName: "Bia", text: "oi", sentAt: 1 });

      expect(screen.getByText("oi")).toBeTruthy();
      expect(screen.getByText("Bia")).toBeTruthy();
    });

    it("lets a later full state win over the locally appended chat", async () => {
      // The server is authoritative, so a state frame that already contains the
      // message must replace the local append rather than duplicate it.
      renderRoom();
      await joinAs("Ana");
      pushState(roomState);

      await userEvent.click(screen.getByRole("button", { name: "Open chat" }));
      pushChat({ id: "m1", authorId: "p2", authorName: "Bia", text: "oi", sentAt: 1 });
      pushState({
        ...roomState,
        messages: [{ id: "m1", authorId: "p2", authorName: "Bia", text: "oi", sentAt: 1 }],
      });

      expect(screen.getAllByText("oi")).toHaveLength(1);
    });

    it("replaces no dom node outside the chat when another person speaks", async () => {
      // Tags every node, then pushes the broadcast the server sends. Any node that
      // is not the same object afterwards was remounted, which is what replays a
      // css animation and reads as a blink.
      const { container } = renderRoom();
      await joinAs("Ana");
      pushState({
        ...roomState,
        myVote: "8",
        participants: [
          { id: "p1", name: "Ana", role: "voter", isOwner: true, isConnected: true, hasVoted: true },
          { id: "p2", name: "Bia", role: "voter", isOwner: false, isConnected: true, hasVoted: false },
        ],
        connectedCount: 2,
      });

      const seen = new WeakSet<Node>();
      const before = [...container.querySelectorAll("*")];
      before.forEach((node) => seen.add(node));

      pushState({
        ...roomState,
        myVote: "8",
        participants: [
          { id: "p1", name: "Ana", role: "voter", isOwner: true, isConnected: true, hasVoted: true },
          { id: "p2", name: "Bia", role: "voter", isOwner: false, isConnected: true, hasVoted: false },
        ],
        connectedCount: 2,
        messages: [
          { id: "m1", authorId: "p2", authorName: "Bia", text: "oi", sentAt: 1 },
        ],
      });

      const chat = container.querySelector(".chat-panel, .chat-launcher");
      const replaced = [...container.querySelectorAll("*")].filter(
        (node) => !seen.has(node) && !chat?.contains(node),
      );

      expect(replaced.map((node) => node.className || node.tagName)).toEqual([]);
    });

    it("survives a broadcast while the seal is still drying", async () => {
      const { container } = renderRoom();
      await joinAs("Ana");
      pushState({ ...roomState, myVote: "8" });

      const input = await openChat();
      expect(container.querySelector("[data-phase]")?.getAttribute("data-phase")).toBe("wet");

      await userEvent.type(input, "oi{Enter}");
      pushState({
        ...roomState,
        myVote: "8",
        messages: [
          { id: "m1", authorId: "p1", authorName: "Ana", text: "oi", sentAt: 1 },
        ],
      });

      expect(container.querySelector("[data-phase]")?.getAttribute("data-phase")).toBe("wet");
    });
  });

});
