import { act, render, screen, waitFor, within } from "@testing-library/react";
import { createTranslator } from "@application/i18n";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomScreen } from "@presentation/RoomScreen";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

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
    catStateListener: ((cat: unknown) => void) | null = null;

    onCatState(listener: (cat: unknown) => void) {
      this.catStateListener = listener;
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
    updateCat(
      x: number,
      y: number,
      direction: string,
      activity: string,
      isPaused: boolean,
    ) {
      this.#record({ type: "cat-update", x, y, direction, activity, isPaused });
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
  id: "abcd2345",
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
    <RoomScreen roomId="abcd2345" translate={createTranslator("en-US")} />,
  );
}

async function joinAs(name: string) {
  await userEvent.type(screen.getByLabelText("Your name"), name);
  await userEvent.click(screen.getByRole("button", { name: "Enter" }));
}

/** The room stays the authority: every guess is withdrawn the moment it answers. */
describe("RoomScreen optimistic vote", () => {
  it("stamps the seal before the room has answered", async () => {
    renderRoom();
    await joinAs("Ana");
    pushState(roomState);

    await userEvent.click(screen.getByRole("button", { name: "Vote 5" }));

    expect(screen.getByRole("button", { name: /selected vote 5/i })).toBeTruthy();
    expect(document.querySelector("[data-glyph]")?.textContent).toBe("5");
  });

  it("keeps the guess while the room has not answered", async () => {
    renderRoom();
    await joinAs("Ana");
    pushState(roomState);

    await userEvent.click(screen.getByRole("button", { name: "Vote 5" }));

    expect(harness.sent).toContainEqual({ type: "vote", value: "5" });
    expect(screen.getByRole("button", { name: /selected vote 5/i })).toBeTruthy();
  });

  it("withdraws the guess once the room agrees", async () => {
    renderRoom();
    await joinAs("Ana");
    pushState(roomState);
    await userEvent.click(screen.getByRole("button", { name: "Vote 5" }));
    expect(screen.getByRole("button", { name: /selected vote 5/i })).toBeTruthy();

    pushState({ ...roomState, myVote: "5" });

    expect(screen.getByRole("button", { name: /selected vote 5/i })).toBeTruthy();
  });

  it("predicts an undo as well as a vote", async () => {
    renderRoom();
    await joinAs("Ana");
    pushState({ ...roomState, myVote: "5" });

    await userEvent.click(screen.getByRole("button", { name: /selected vote 5/i }));

    expect(screen.queryByRole("button", { name: /selected vote 5/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Vote 5" })).toBeTruthy();
  });

  it("takes the room's answer over its own guess when they differ", async () => {
    renderRoom();
    await joinAs("Ana");
    pushState(roomState);
    await userEvent.click(screen.getByRole("button", { name: "Vote 5" }));
    expect(screen.getByRole("button", { name: /selected vote 5/i })).toBeTruthy();

    pushState({ ...roomState, myVote: null });

    expect(screen.getByRole("button", { name: "Vote 5" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /selected vote/i })).toBeNull();
  });

  it("drops the guess when the server refuses the vote", async () => {
    renderRoom();
    await joinAs("Ana");
    pushState(roomState);
    await userEvent.click(screen.getByRole("button", { name: "Vote 5" }));
    expect(screen.getByRole("button", { name: /selected vote 5/i })).toBeTruthy();

    pushError("invalid_vote");

    expect(screen.getByRole("button", { name: "Vote 5" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /selected vote/i })).toBeNull();
  });

  it("goes back to voting on the next tap after the room has agreed", async () => {
    renderRoom();
    await joinAs("Ana");
    pushState(roomState);
    await userEvent.click(screen.getByRole("button", { name: "Vote 5" }));
    pushState({ ...roomState, myVote: "5" });

    await userEvent.click(screen.getByRole("button", { name: /selected vote 5/i }));

    expect(screen.queryByRole("button", { name: /selected vote/i })).toBeNull();
  });

  it("predicts a second tap from what is on screen, not from the last answer", async () => {
    renderRoom();
    await joinAs("Ana");
    pushState(roomState);
    await userEvent.click(screen.getByRole("button", { name: "Vote 5" }));

    await userEvent.click(screen.getByRole("button", { name: /selected vote 5/i }));

    expect(screen.queryByRole("button", { name: /selected vote/i })).toBeNull();
  });
});

describe("RoomScreen", () => {
  beforeEach(() => {
    harness.sockets.length = 0;
    harness.joinCalls.length = 0;
    harness.sent.length = 0;
    harness.errors.length = 0;

    vi.stubGlobal("location", {
      origin: "https://hanko.skvggor.workers.dev",
      pathname: "/room/abcd2345",
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
      expect(setItem).toHaveBeenCalledWith("hanko:name:abcd2345", "Ana");
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

  it("holds the name gate as working until the room answers", async () => {
    renderRoom();
    await joinAs("Ana");

    const button = await screen.findByRole("button", { name: "Entering..." });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  it("lets the name be corrected when the room refuses the join", async () => {
    renderRoom();
    await joinAs("Ana");
    await screen.findByRole("button", { name: "Entering..." });

    pushError("name_required");

    expect(screen.getByRole("button", { name: "Enter" }).hasAttribute("disabled")).toBe(false);
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





  it("shows the room id in the share chip", async () => {
    renderRoom();
    await joinAs("Ana");
    await waitFor(() => expect(harness.joinCalls).toHaveLength(1));

    pushState(roomState);

    expect(await screen.findByText("abcd2345")).toBeTruthy();
  });

  describe("chat as cat bubbles", () => {
    function composerInput() {
      return screen.getByRole("textbox", { name: "Say something" });
    }

    it("keeps the estimate panel mounted while typing", async () => {
      renderRoom();
      await joinAs("Ana");
      pushState(roomState);

      const input = composerInput();
      const before = screen.getByText("Your estimate").closest("div");

      await userEvent.type(input, "hello");

      expect(screen.getByText("Your estimate").closest("div")).toBe(before);
    });

    it("forwards chat messages to the connection", async () => {
      renderRoom();
      await joinAs("Ana");
      pushState(roomState);

      const input = composerInput();
      await userEvent.type(input, "oi{Enter}");

      expect(harness.sent).toContainEqual({ type: "chat", text: "oi" });
    });

    it("does not restart the stamp animation when a message is sent", async () => {
      const { container } = renderRoom();
      await joinAs("Ana");
      pushState({ ...roomState, myVote: "8" });

      const input = composerInput();
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

      const input = composerInput();
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

      const input = composerInput();
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

      const hanko = () => screen.getByText("Your estimate").closest("section");

      const before = hanko()?.outerHTML;
      const phaseBefore = container
        .querySelector("[data-phase]")
        ?.getAttribute("data-phase");

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
      expect(container.querySelector("[data-phase]")?.getAttribute("data-phase")).toBe(
        phaseBefore,
      );
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

    it("shows the message as a speech bubble when it arrives on the chat frame", async () => {
      renderRoom();
      await joinAs("Ana");
      pushState({
        ...roomState,
        participants: [
          { id: "p1", name: "Ana", role: "voter", isOwner: true, isConnected: true, hasVoted: false },
          { id: "p2", name: "Bia", role: "voter", isOwner: false, isConnected: true, hasVoted: false },
        ],
        connectedCount: 2,
      });

      pushChat({ id: "m1", authorId: "p2", authorName: "Bia", text: "oi", sentAt: 1 });

      expect(screen.getByText("oi")).toBeTruthy();
    });

    it("lets a later full state win over the locally appended chat", async () => {
      // The server is authoritative, so a state frame that already contains the
      // message must replace the local append rather than duplicate it.
      renderRoom();
      await joinAs("Ana");
      pushState({
        ...roomState,
        participants: [
          { id: "p1", name: "Ana", role: "voter", isOwner: true, isConnected: true, hasVoted: false },
          { id: "p2", name: "Bia", role: "voter", isOwner: false, isConnected: true, hasVoted: false },
        ],
        connectedCount: 2,
      });

      pushChat({ id: "m1", authorId: "p2", authorName: "Bia", text: "oi", sentAt: 1 });
      pushState({
        ...roomState,
        participants: [
          { id: "p1", name: "Ana", role: "voter", isOwner: true, isConnected: true, hasVoted: false },
          { id: "p2", name: "Bia", role: "voter", isOwner: false, isConnected: true, hasVoted: false },
        ],
        connectedCount: 2,
        messages: [{ id: "m1", authorId: "p2", authorName: "Bia", text: "oi", sentAt: 1 }],
      });

      expect(screen.getAllByText("oi")).toHaveLength(1);
    });

    it("replaces no dom node outside the cat overlay when another person speaks", async () => {
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

      const overlay = container.querySelector(".cat-overlay, .cat-composer");
      const replaced = [...container.querySelectorAll("*")].filter(
        (node) => !seen.has(node) && !overlay?.contains(node),
      );

      expect(replaced.map((node) => node.className || node.tagName)).toEqual([]);
    });

    it("survives a broadcast while the seal is still drying", async () => {
      const { container } = renderRoom();
      await joinAs("Ana");
      pushState({ ...roomState, myVote: "8" });

      const phase = () =>
        container.querySelector("[data-phase]")?.getAttribute("data-phase");
      const input = composerInput();
      const before = phase();

      expect(before).not.toBeNull();

      await userEvent.type(input, "oi{Enter}");
      pushState({
        ...roomState,
        myVote: "8",
        messages: [
          { id: "m1", authorName: "Ana", authorId: "p1", role: "voter", text: "oi", sentAt: 1 },
        ],
      });

      expect(phase()).toBe(before);
    });
  });
});

describe("RoomScreen owner controls", () => {
  const ownerState = {
    ...roomState,
    participants: [
      {
        id: "p1",
        name: "Ana",
        role: "voter",
        isOwner: true,
        isConnected: true,
        hasVoted: true,
      },
      {
        id: "p2",
        name: "Bruno",
        role: "voter",
        isOwner: false,
        isConnected: true,
        hasVoted: false,
      },
    ],
    connectedCount: 2,
  };

  const revealedState = {
    ...ownerState,
    isRevealed: true,
    reveals: [
      { participantId: "p1", name: "Ana", value: "5" },
      { participantId: "p2", name: "Bruno", value: "5" },
    ],
    totalPoints: 10,
    myVote: "5",
  };

  beforeEach(() => {
    harness.sockets.length = 0;
    harness.joinCalls.length = 0;
    harness.sent.length = 0;
    harness.errors.length = 0;

    vi.stubGlobal("location", {
      origin: "https://hanko.skvggor.workers.dev",
      pathname: "/room/abcd2345",
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

  async function enterRoom() {
    renderRoom();
    await joinAs("Ana");
    await waitFor(() => expect(harness.joinCalls).toHaveLength(1));
  }

  it("offers the next round only once the votes are out", async () => {
    await enterRoom();
    pushState(revealedState);

    expect(await screen.findByRole("button", { name: "Next round" })).toBeTruthy();
  });

  it("asks the connection for the next round", async () => {
    await enterRoom();
    pushState(revealedState);

    await userEvent.click(await screen.findByRole("button", { name: "Next round" }));

    expect(harness.sent).toContainEqual({ type: "next-round" });
  });

  it("asks the connection to reset the votes", async () => {
    await enterRoom();
    pushState(ownerState);

    await userEvent.click(await screen.findByRole("button", { name: "Reset votes" }));

    expect(harness.sent).toContainEqual({ type: "reset-round" });
  });

  it("changes the scale to the one that was picked", async () => {
    await enterRoom();
    pushState(ownerState);

    await userEvent.click(await screen.findByRole("button", { name: "T-shirt sizes" }));

    expect(harness.sent).toContainEqual({ type: "set-deck", deckId: "tshirt" });
  });

  it("offers every scale the deck defines", async () => {
    await enterRoom();
    pushState(ownerState);

    expect(await screen.findByRole("button", { name: "Fibonacci" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "T-shirt sizes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Linear 1-10" })).toBeTruthy();
  });

  it("hands ownership to the participant that was chosen", async () => {
    await enterRoom();
    pushState(ownerState);

    await userEvent.click(await screen.findByRole("button", { name: "Make owner" }));

    expect(harness.sent).toContainEqual({
      type: "transfer-ownership",
      participantId: "p2",
    });
  });

  it("turns a voter into a watcher when the owner asks", async () => {
    await enterRoom();
    pushState(ownerState);

    const row = (await screen.findByText("Bruno", { exact: true })).closest<HTMLElement>(
      "[data-participant-row]",
    );
    await userEvent.click(within(row!).getByRole("button", { name: "Make watcher" }));

    expect(harness.sent).toContainEqual({
      type: "set-role",
      participantId: "p2",
      role: "spectator",
    });
  });

  it("turns a watcher back into a voter", async () => {
    await enterRoom();
    pushState({
      ...ownerState,
      participants: [
        ownerState.participants[0],
        { ...ownerState.participants[1], role: "spectator" },
      ],
    });

    await userEvent.click(await screen.findByRole("button", { name: "Make voter" }));

    expect(harness.sent).toContainEqual({
      type: "set-role",
      participantId: "p2",
      role: "voter",
    });
  });

  it("removes the participant the owner picked out", async () => {
    await enterRoom();
    pushState(ownerState);

    const row = (await screen.findByText("Bruno", { exact: true })).closest<HTMLElement>(
      "[data-participant-row]",
    );
    await userEvent.click(within(row!).getByRole("button", { name: "Remove" }));

    expect(harness.sent).toContainEqual({
      type: "remove-participant",
      participantId: "p2",
    });
  });

  it("never offers to remove the owner themselves", async () => {
    await enterRoom();
    pushState(ownerState);

    await screen.findByRole("button", { name: "Make owner" });

    const rows = screen.getAllByRole("button", { name: "Remove" })
      .map((button) => button.closest<HTMLElement>("[data-participant-row]"))
      .filter((row): row is HTMLElement => row !== null);

    expect(rows).toHaveLength(1);
  });

  // The rename goes through the app's own modal now, so these drive the field instead of
  // a stubbed window.prompt. The wire message is what the room cares about either way.
  async function renameTo(name: string) {
    await userEvent.click(await screen.findByRole("button", { name: "Change name" }));
    const field = screen.getByLabelText("Your name");
    await userEvent.clear(field);
    if (name.length > 0) await userEvent.type(field, name);
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
    );
  }

  it("takes a new name from the rename modal", async () => {
    await enterRoom();
    pushState(ownerState);

    await renameTo("Ana Maria");

    expect(harness.sent).toContainEqual({ type: "set-name", name: "Ana Maria" });
  });

  it("keeps the renamed name for the way back in", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem });

    await enterRoom();
    pushState(ownerState);

    await renameTo("Ana Maria");

    await waitFor(() => {
      expect(setItem).toHaveBeenCalledWith("hanko:name:abcd2345", "Ana Maria");
    });
  });

  it("sends nothing when the rename modal is dismissed", async () => {
    await enterRoom();
    pushState(ownerState);

    await userEvent.click(await screen.findByRole("button", { name: "Change name" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }),
    );

    expect(harness.sent).toHaveLength(0);
  });

  it("refuses an empty name instead of sending one to the server", async () => {
    await enterRoom();
    pushState(ownerState);

    await renameTo("");

    expect(harness.sent).toHaveLength(0);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("never calls the browser's own prompt", async () => {
    const prompt = vi.fn();
    vi.stubGlobal("prompt", prompt);
    await enterRoom();
    pushState(ownerState);

    await userEvent.click(await screen.findByRole("button", { name: "Change name" }));

    expect(prompt).not.toHaveBeenCalled();
  });

  it("asks the connection to delete the room, once the owner confirms", async () => {
    await enterRoom();
    pushState(ownerState);

    await userEvent.click(await screen.findByRole("button", { name: "Delete room" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete it" }));

    expect(harness.sent).toContainEqual({ type: "delete-room" });
  });

  it("saves a session name once it validates", async () => {
    await enterRoom();
    pushState(ownerState);

    await userEvent.type(
      await screen.findByLabelText("Session name"),
      "Sprint 42",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(harness.sent).toContainEqual({
      type: "set-room-name",
      name: "Sprint 42",
    });
  });

  it("clears the session name when the field is emptied", async () => {
    await enterRoom();
    pushState({ ...ownerState, name: "Sprint 42" });

    const field = await screen.findByLabelText("Session name");
    await userEvent.clear(field);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(harness.sent).toContainEqual({ type: "set-room-name", name: null });
  });

  it("shows the room link copied once the clipboard accepts it", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { language: "en-US", clipboard: { writeText } });
    await enterRoom();
    pushState(ownerState);

    await userEvent.click(await screen.findByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledWith("https://hanko.skvggor.workers.dev/room/abcd2345");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("still confirms the copy when there is no clipboard to write to", async () => {
    vi.stubGlobal("navigator", { language: "en-US", clipboard: undefined });
    await enterRoom();
    pushState(ownerState);

    await userEvent.click(await screen.findByRole("button", { name: "Copy link" }));

    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });
});

describe("RoomScreen deleting the room", () => {
  const ownerState = {
    ...roomState,
    participants: [
      {
        id: "p1",
        name: "Ana",
        role: "voter",
        isOwner: true,
        isConnected: true,
        hasVoted: true,
      },
    ],
  };

  const onRoomDeleted = vi.fn();

  beforeEach(() => {
    harness.sockets.length = 0;
    harness.joinCalls.length = 0;
    harness.sent.length = 0;
    harness.errors.length = 0;
    onRoomDeleted.mockClear();

    vi.stubGlobal("location", {
      origin: "https://hanko.skvggor.workers.dev",
      pathname: "/room/abcd2345",
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

  async function enterRoom() {
    render(
      <RoomScreen
        onRoomDeleted={onRoomDeleted}
        roomId="abcd2345"
        translate={createTranslator("en-US")}
      />,
    );
    await joinAs("Ana");
    await waitFor(() => expect(harness.joinCalls).toHaveLength(1));
    pushState(ownerState);
  }

  it("asks before deleting, because the room cannot be brought back", async () => {
    await enterRoom();

    await userEvent.click(await screen.findByRole("button", { name: "Delete room" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(harness.sent).toHaveLength(0);
  });

  it("names the room in the warning so nobody deletes the wrong one", async () => {
    await enterRoom();

    await userEvent.click(await screen.findByRole("button", { name: "Delete room" }));

    expect(screen.getByRole("dialog").textContent).toContain("This room");
  });

  it("sends nothing until the owner confirms", async () => {
    await enterRoom();

    await userEvent.click(await screen.findByRole("button", { name: "Delete room" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete it" }));

    expect(harness.sent).toContainEqual({ type: "delete-room" });
  });

  it("leaves the room alone when the owner backs out", async () => {
    await enterRoom();

    await userEvent.click(await screen.findByRole("button", { name: "Delete room" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));

    expect(harness.sent).toHaveLength(0);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the warning without deleting when the escape key is pressed", async () => {
    await enterRoom();

    await userEvent.click(await screen.findByRole("button", { name: "Delete room" }));
    await userEvent.keyboard("{Escape}");

    expect(harness.sent).toHaveLength(0);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("returns focus to the delete button when the warning closes", async () => {
    await enterRoom();
    const trigger = await screen.findByRole("button", { name: "Delete room" });

    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));

    expect(document.activeElement).toBe(trigger);
  });

  it("marks the warning as the thing a screen reader lands on", async () => {
    await enterRoom();

    await userEvent.click(await screen.findByRole("button", { name: "Delete room" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
  });

  it("sends the owner home once the room is really gone", async () => {
    await enterRoom();

    pushDeleted();

    expect(onRoomDeleted).toHaveBeenCalledTimes(1);
  });

  it("tells the owner the room is gone on the way out", async () => {
    await enterRoom();

    pushDeleted();

    expect(onRoomDeleted).toHaveBeenCalledWith("room_deleted");
  });

  it("leaves the room without asking anyone to leave a room that no longer exists", async () => {
    await enterRoom();

    pushDeleted();

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
