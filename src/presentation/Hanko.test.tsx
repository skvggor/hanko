import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Hanko } from "@presentation/Hanko";
import type { PublicRoomState } from "@domain/protocol";
import { createTranslator } from "@application/i18n";

const translate = createTranslator("en-US");

function state(overrides: Partial<PublicRoomState> = {}): PublicRoomState {
  return {
    id: "room-1",
    deckId: "fibonacci",
    round: 1,
    isRevealed: false,
    participants: [
      { id: "p1", name: "Ana", role: "voter", isOwner: true, isConnected: true, hasVoted: false },
      { id: "p2", name: "Bruno", role: "spectator", isOwner: false, isConnected: true, hasVoted: false },
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

describe("Hanko", () => {
  it("renders the fibonacci scale", () => {
    render(<Hanko myParticipantId="p1" onVote={vi.fn()} state={state()} translate={translate} />);

    for (const value of ["0", "1", "5", "13", "?", "Coffee"]) {
      expect(screen.getByRole("button", { name: `Vote ${value}` })).toBeTruthy();
    }
  });

  it("renders the t-shirt scale", () => {
    render(
      <Hanko
        myParticipantId="p1"
        onVote={vi.fn()}
        state={state({ deckId: "tshirt" })}
        translate={translate}
      />,
    );

    expect(screen.getByRole("button", { name: /vote XS/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /vote 13/i })).toBeNull();
  });

  it("calls onVote with the chosen value", async () => {
    const onVote = vi.fn();
    render(<Hanko myParticipantId="p1" onVote={onVote} state={state()} translate={translate} />);

    await userEvent.click(screen.getByRole("button", { name: /vote 8/i }));

    expect(onVote).toHaveBeenCalledWith("8");
  });

  it("marks my own vote as pressed", () => {
    render(
      <Hanko
        myParticipantId="p1"
        onVote={vi.fn()}
        state={state({ myVote: "5" })}
        translate={translate}
      />,
    );

    const chosen = screen.getByRole("button", { name: /selected vote 5/i });
    expect(chosen.getAttribute("aria-pressed")).toBe("true");
  });

  it("disables the scale for a spectator", () => {
    render(
      <Hanko myParticipantId="p2" onVote={vi.fn()} state={state()} translate={translate} />,
    );

    expect(screen.getByRole("button", { name: /vote 3/i }).hasAttribute("disabled")).toBe(true);
  });

  it("keeps the scale enabled for a voter", () => {
    render(
      <Hanko myParticipantId="p1" onVote={vi.fn()} state={state()} translate={translate} />,
    );

    expect(screen.getByRole("button", { name: /vote 3/i }).hasAttribute("disabled")).toBe(false);
  });

  it("hides the scale before the reveal", () => {
    render(
      <Hanko
        myParticipantId="p1"
        onVote={vi.fn()}
        state={state({ reveals: [{ participantId: "p1", name: "Ana", role: "voter", vote: "8", points: 8 }] })}
        translate={translate}
      />,
    );

    expect(screen.getByRole("button", { name: /vote 8/i })).toBeTruthy();
  });

  it("shows the reveal sheet instead of the scale", () => {
    vi.useFakeTimers();
    render(
      <Hanko
        myParticipantId="p1"
        onVote={vi.fn()}
        state={state({
          isRevealed: true,
          totalPoints: 8,
          reveals: [{ participantId: "p1", name: "Ana", role: "voter", vote: "8", points: 8 }],
        })}
        translate={translate}
      />,
    );

    expect(screen.queryByRole("button", { name: /vote 8/i })).toBeNull();
    expect(document.querySelector("[data-complete]")).not.toBeNull();
    vi.useRealTimers();
  });

  it("hides the verdict until the owner reveals", () => {
    const { rerender } = render(
      <Hanko myParticipantId="p1" onVote={vi.fn()} state={state()} translate={translate} />,
    );
    expect(document.querySelector("[data-complete]")).toBeNull();

    rerender(
      <Hanko
        myParticipantId="p1"
        onVote={vi.fn()}
        state={state({
          isRevealed: true,
          reveals: [{ participantId: "p1", name: "Ana", role: "voter", vote: "8", points: 8 }],
        })}
        translate={translate}
      />,
    );

    expect(document.querySelector("[data-complete]")).not.toBeNull();
  });

  it("tells a spectator to wait for the reveal", () => {
    render(
      <Hanko myParticipantId="p2" onVote={vi.fn()} state={state()} translate={translate} />,
    );

    expect(screen.getByText("Waiting for the owner to reveal")).toBeTruthy();
  });

  it("translates the coffee label", () => {
    const translatePortuguese = createTranslator("pt-BR");
    render(
      <Hanko
        myParticipantId="p1"
        onVote={vi.fn()}
        state={state()}
        translate={translatePortuguese}
      />,
    );

    expect(screen.getByRole("button", { name: /votar café/i })).toBeTruthy();
  });
});