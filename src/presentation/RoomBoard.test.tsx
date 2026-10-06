import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomBoard, type RoomBoardProps } from "@presentation/RoomBoard";
import type { PublicRoomState } from "@domain/protocol";
import { createTranslator } from "@application/i18n";
import { SESSION_NAME_MAX_LENGTH } from "@domain/sessionName";

const translate = createTranslator("en-US");

function state(overrides: Partial<PublicRoomState> = {}): PublicRoomState {
  return {
    id: "room-1",
    deckId: "fibonacci",
    round: 2,
    isRevealed: false,
    participants: [
      { id: "p1", name: "Ana", role: "voter", isOwner: true, isConnected: true, hasVoted: false },
      { id: "p2", name: "Bruno", role: "voter", isOwner: false, isConnected: true, hasVoted: true },
      { id: "p3", name: "Carla", role: "spectator", isOwner: false, isConnected: false, hasVoted: false },
    ],
    ownerId: "p1",
    gracePeriodMs: 300_000,
    connectedCount: 2,
    reveals: null,
    totalPoints: null,
    myVote: null,
  messages: [],
  name: null,
    ...overrides,
  };
}

function renderWithContainer(
  overrides: Partial<PublicRoomState> = {},
  props: Partial<RoomBoardProps> = {},
) {
  const handlers = {
    onCopyLink: vi.fn(),
    onReveal: vi.fn(),
    onNextRound: vi.fn(),
    onResetRound: vi.fn(),
    onSetDeck: vi.fn(),
    onDeleteRoom: vi.fn(),
    onTransferOwnership: vi.fn(),
    onRemoveParticipant: vi.fn(),
    onSetRole: vi.fn(),
    onSetRoomName: vi.fn(),
    onRename: vi.fn(),
    ...props,
  };

  const view = render(
    <RoomBoard
      copied={false}
      myParticipantId="p1"
      shareUrl="https://hanko.pages.dev/room/room-1"
      state={state(overrides)}
      translate={translate}
      {...handlers}
    />,
  );

  return { ...view, handlers };
}

function renderBoard(overrides: Partial<PublicRoomState> = {}, props: Partial<RoomBoardProps> = {}) {
  const handlers = {
    onCopyLink: vi.fn(),
    onReveal: vi.fn(),
    onNextRound: vi.fn(),
    onResetRound: vi.fn(),
    onSetDeck: vi.fn(),
    onDeleteRoom: vi.fn(),
    onTransferOwnership: vi.fn(),
    onRemoveParticipant: vi.fn(),
    onSetRole: vi.fn(),
    onSetRoomName: vi.fn(),
    onRename: vi.fn(),
    ...props,
  };

  render(
    <RoomBoard
      copied={false}
      myParticipantId="p1"
      shareUrl="https://hanko.pages.dev/room/room-1"
      state={state(overrides)}
      translate={translate}
      {...handlers}
    />,
  );

  return handlers;
}

describe("RoomBoard", () => {
  beforeEach(() => {
    vi.stubGlobal("prompt", vi.fn(() => "Ana Maria"));
    vi.stubGlobal("navigator", { ...globalThis.navigator, clipboard: { writeText: vi.fn() } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the round spelled out in a chip", () => {
    renderBoard();
    expect(screen.getByText("Round 2")).toBeTruthy();
  });

  it("keeps the round quieter than the room", () => {
    const { container } = renderWithContainer();
    const round = screen.getByText("Round 2");

    expect(round.className).toContain("bg-ink/8");
    expect(round.className).toContain("text-ink-dim");
    expect(container.querySelector('[class*="text-[22px]"]')).toBeNull();
  });

  it("shows how many people are connected, without shouting", () => {
    const { container } = renderWithContainer();
    const count = screen.getByText("2 here");

    expect(container.querySelector("p")?.className).not.toContain("text-[22px]");
    expect(count.className).toContain("text-ink-dim");
  });

  it("lists every participant", () => {
    renderBoard();
    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.getByText("Bruno")).toBeTruthy();
    expect(screen.getByText("Carla")).toBeTruthy();
  });

  it("marks the owner", () => {
    const { container } = renderWithContainer();
    expect(container.querySelectorAll('[data-role="owner"]')).toHaveLength(1);
  });

  it("marks spectators", () => {
    renderBoard();
    expect(screen.getByText("Watching")).toBeTruthy();
  });

  it("tells the room who still owes a vote", () => {
    renderBoard();
    expect(screen.getByText("Waiting for 1")).toBeTruthy();
  });

  it("marks the person who voted and the one who did not", () => {
    renderBoard();
    expect(screen.getByText("Ana has not voted yet")).toBeTruthy();
    expect(screen.getByText("Bruno has voted")).toBeTruthy();
  });

  it("never shows the value of a hidden vote", () => {
    const { container } = renderWithContainer();
    expect(container.textContent).not.toContain("13");
  });

  it("hides owner controls from non owners", () => {
    renderBoard({}, { myParticipantId: "p2" });
    expect(screen.queryByRole("button", { name: "Reveal" })).toBeNull();
  });

  it("shows reveal to the owner", () => {
    renderBoard();
    expect(screen.getByRole("button", { name: "Reveal" })).toBeTruthy();
  });

  it("swaps reveal for next round once revealed", () => {
    renderBoard({ isRevealed: true });
    expect(screen.getByRole("button", { name: "Next round" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reveal" })).toBeNull();
  });

  it("calls onReveal", async () => {
    const handlers = renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(handlers.onReveal).toHaveBeenCalled();
  });

  it("calls onNextRound", async () => {
    const handlers = renderBoard({ isRevealed: true });
    await userEvent.click(screen.getByRole("button", { name: "Next round" }));
    expect(handlers.onNextRound).toHaveBeenCalled();
  });

  it("calls onResetRound", async () => {
    const handlers = renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Reset votes" }));
    expect(handlers.onResetRound).toHaveBeenCalled();
  });

  it("calls onDeleteRoom", async () => {
    const handlers = renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Delete room" }));
    expect(handlers.onDeleteRoom).toHaveBeenCalled();
  });

  it("offers every deck", () => {
    renderBoard();
    expect(screen.getByRole("button", { name: "Fibonacci" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "T-shirt sizes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Linear 1-10" })).toBeTruthy();
  });

  it("marks the active deck as pressed", () => {
    renderBoard();
    expect(
      screen.getByRole("button", { name: "Fibonacci" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("calls onSetDeck with the chosen deck", async () => {
    const handlers = renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Linear 1-10" }));
    expect(handlers.onSetDeck).toHaveBeenCalledWith("linear");
  });

  it("calls onTransferOwnership", async () => {
    const handlers = renderBoard();
    await userEvent.click(screen.getAllByRole("button", { name: "Make owner" })[0]!);
    expect(handlers.onTransferOwnership).toHaveBeenCalledWith("p2");
  });

  it("calls onRemoveParticipant", async () => {
    const handlers = renderBoard();
    await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!);
    expect(handlers.onRemoveParticipant).toHaveBeenCalled();
  });

  it("calls onSetRole to make somebody watch", async () => {
    const handlers = renderBoard();
    await userEvent.click(screen.getAllByRole("button", { name: "Make watcher" })[0]!);
    expect(handlers.onSetRole).toHaveBeenCalledWith("p2", "spectator");
  });

  it("calls onSetRole to restore a spectator as voter", async () => {
    const handlers = renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Make voter" }));
    expect(handlers.onSetRole).toHaveBeenCalledWith("p3", "voter");
  });

  it("offers rename only to myself", () => {
    renderBoard();
    expect(screen.getAllByRole("button", { name: "Change name" })).toHaveLength(1);
  });

  it("calls onRename with the prompted name", async () => {
    const handlers = renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Change name" }));
    expect(handlers.onRename).toHaveBeenCalledWith("Ana Maria");
  });

  it("skips renaming when the prompt is dismissed", async () => {
    vi.stubGlobal("prompt", vi.fn(() => null));
    const handlers = renderBoard();

    await userEvent.click(screen.getByRole("button", { name: "Change name" }));

    expect(handlers.onRename).not.toHaveBeenCalled();
  });

  it("shows the room link as one clean snippet", () => {
    const { container } = renderWithContainer();
    const chip = container.querySelector(".snippet__chip");

    expect(chip?.textContent).toContain("hanko.pages.dev/room/room-1");
  });

  it("confirms a copied link on the chip", () => {
    renderBoard({}, { copied: true });
    expect(screen.getAllByRole("button", { name: "Copied" })).toHaveLength(1);
  });

  it("presents the link as a labelled snippet", () => {
    renderBoard();
    expect(screen.getByText("share")).toBeTruthy();
  });

  it("asks the room to copy the link", async () => {
    const handlers = renderBoard();

    await userEvent.click(document.querySelector(".snippet__chip")!);

    expect(handlers.onCopyLink).toHaveBeenCalled();
  });


  it("does not show owner actions on my own row", () => {
    renderBoard();
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(2);
  });

  it("renders in portuguese", () => {
    render(
      <RoomBoard
        copied={false}
        myParticipantId="p1"
        onCopyLink={vi.fn()}
        onDeleteRoom={vi.fn()}
        onNextRound={vi.fn()}
        onRemoveParticipant={vi.fn()}
        onRename={vi.fn()}
        onResetRound={vi.fn()}
        onReveal={vi.fn()}
        onSetDeck={vi.fn()}
        onSetRole={vi.fn()}
        onSetRoomName={vi.fn()}
        onTransferOwnership={vi.fn()}
        shareUrl="https://hanko.app/room/room-1"
        state={state()}
        translate={createTranslator("pt-BR")}
      />,
    );

    expect(screen.getByText("Rodada 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revelar" })).toBeTruthy();
  });
});
describe("RoomBoard live voting meter", () => {
  it("pulses while someone still owes a vote", () => {
    const { container } = renderWithContainer();
    const meter = container.querySelector("[role='progressbar']");

    expect(meter?.getAttribute("data-pending")).toBe("true");
    expect(container.querySelector(".meter-sweep")).not.toBeNull();
  });

  it("goes quiet once everyone has voted", () => {
    const { container } = renderWithContainer({
      participants: [
        { id: "p1", name: "Ana", role: "voter", isOwner: true, isConnected: true, hasVoted: true },
        { id: "p2", name: "Bruno", role: "voter", isOwner: false, isConnected: true, hasVoted: true },
        { id: "p3", name: "Carla", role: "spectator", isOwner: false, isConnected: true, hasVoted: false },
      ],
    });
    const meter = container.querySelector("[role='progressbar']");

    expect(meter?.getAttribute("data-pending")).toBe("false");
    expect(container.querySelector(".meter-sweep")).toBeNull();
  });

  it("reports the share the room has answered", () => {
    const { container } = renderWithContainer({
      participants: [
        { id: "p1", name: "Ana", role: "voter", isOwner: true, isConnected: true, hasVoted: true },
        { id: "p2", name: "Bruno", role: "voter", isOwner: false, isConnected: true, hasVoted: true },
        { id: "p3", name: "Carla", role: "voter", isOwner: false, isConnected: true, hasVoted: false },
        { id: "p4", name: "Dan", role: "voter", isOwner: false, isConnected: true, hasVoted: false },
      ],
    });

    expect(
      container.querySelector("[role='progressbar']")?.getAttribute("aria-valuenow"),
    ).toBe("50");
  });

  it("never counts a watcher as someone still to vote", () => {
    const { container } = renderWithContainer({
      participants: [
        { id: "p1", name: "Ana", role: "voter", isOwner: true, isConnected: true, hasVoted: true },
        { id: "p2", name: "Bruno", role: "spectator", isOwner: false, isConnected: true, hasVoted: false },
      ],
    });

    expect(
      container.querySelector("[role='progressbar']")?.getAttribute("aria-valuenow"),
    ).toBe("100");
  });

  it("hides the meter once the votes are revealed", () => {
    const { container } = renderWithContainer({ isRevealed: true });
    expect(container.querySelector("[role='progressbar']")).toBeNull();
  });
});

describe("RoomBoard voted markers", () => {
  it("says who still owes a vote", () => {
    renderBoard();
    expect(screen.getByText("Waiting for 1")).toBeTruthy();
  });

  it("marks each voter in words, not dots", () => {
    renderBoard();
    expect(screen.getByText("Voted")).toBeTruthy();
  });

  it("says when the room is complete", () => {
    renderBoard({
      participants: [
        { id: "p1", name: "Ana", role: "voter", isOwner: true, isConnected: true, hasVoted: true },
        { id: "p2", name: "Bruno", role: "voter", isOwner: false, isConnected: true, hasVoted: true },
        { id: "p3", name: "Carla", role: "spectator", isOwner: false, isConnected: true, hasVoted: false },
      ],
    });

    expect(screen.getByText("Everyone has voted")).toBeTruthy();
  });
  describe("session name", () => {
    const asOwner = () => ({ ownerId: "p1" });

    it("hides the field from non owners", () => {
      renderBoard({ ownerId: "p2" });
      expect(screen.queryByLabelText("Session name")).toBeNull();
    });

    it("shows the field to the owner", () => {
      renderBoard(asOwner());
      expect(screen.getByLabelText("Session name")).toBeTruthy();
    });

    it("sends the typed name", async () => {
      const onSetRoomName = vi.fn();
      renderBoard(asOwner(), { onSetRoomName });

      await userEvent.type(screen.getByLabelText("Session name"), "Sprint 42");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(onSetRoomName).toHaveBeenCalledWith("Sprint 42");
    });

    it("starts from the name already on the room", () => {
      renderBoard({ ...asOwner(), name: "Planning" });
      expect(screen.getByLabelText<HTMLInputElement>("Session name").value).toBe("Planning");
    });

    it("clears the name when the field is emptied", async () => {
      const onSetRoomName = vi.fn();
      renderBoard({ ...asOwner(), name: "Planning" }, { onSetRoomName });

      await userEvent.clear(screen.getByLabelText("Session name"));
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(onSetRoomName).toHaveBeenCalledWith(null);
    });

    it("sends a plain name without complaining", async () => {
      const onSetRoomName = vi.fn();
      renderBoard(asOwner(), { onSetRoomName });

      await userEvent.type(screen.getByLabelText("Session name"), "Sprint");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(onSetRoomName).toHaveBeenCalledWith("Sprint");
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("refuses a zero width space and says why", async () => {
      const onSetRoomName = vi.fn();
      renderBoard(asOwner(), { onSetRoomName });

      fireEvent.change(screen.getByLabelText("Session name"), {
        target: { value: "Sprint\u200b42" },
      });
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(onSetRoomName).not.toHaveBeenCalled();
      expect(screen.getByRole("alert").textContent).toContain("characters we cannot show");
    });

    it("caps what can be typed at the domain limit", () => {
      renderBoard(asOwner());
      const input = screen.getByLabelText<HTMLInputElement>("Session name");
      expect(input.maxLength).toBe(SESSION_NAME_MAX_LENGTH);
    });
  });

});
