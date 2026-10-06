import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RevealSheet,
  revealDuration,
  tiltFor,
} from "@presentation/RevealSheet";
import type { RevealedVote } from "@domain/protocol";
import { createTranslator } from "@application/i18n";

const translate = createTranslator("en-US");

const SCALE = ["0", "1", "2", "3", "5", "8", "13", "21", "?", "coffee"] as const;

/** Seal values live inside the list; the summary repeats them, so scope the query. */
function sealValues(): string[] {
  return screen
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

function entry(
  participantId: string,
  name: string,
  vote: string | null,
  role: RevealedVote["role"] = "voter",
): RevealedVote {
  return {
    participantId,
    name,
    role,
    vote,
    points: vote === null ? null : Number.parseFloat(vote),
  };
}

describe("tiltFor", () => {
  it("tilts a lone seal", () => {
    expect(tiltFor(0, 1)).toBe(-2);
  });

  it("spreads the tilt across a block", () => {
    const tilts = [tiltFor(0, 3), tiltFor(1, 3), tiltFor(2, 3)];

    expect(tilts[0]).toBeCloseTo(-3);
    expect(tilts[1]).toBeCloseTo(0);
    expect(tilts[2]).toBeCloseTo(3);
  });

  it("keeps every tilt inside a readable range", () => {
    const tilts = Array.from({ length: 20 }, (_, index) => tiltFor(index, 20));

    for (const tilt of tilts) {
      expect(Math.abs(tilt)).toBeLessThanOrEqual(4);
    }
  });
});

describe("revealDuration", () => {
  it("is zero for an empty room", () => {
    expect(revealDuration(0)).toBe(0);
  });

  it("grows with the crowd", () => {
    expect(revealDuration(5)).toBeGreaterThan(revealDuration(2));
  });
});

describe("RevealSheet", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("reveals nothing on the first frame", () => {
    render(<RevealSheet entries={[entry("p1", "Ana", "8")]} scale={SCALE} translate={translate} />);

    expect(screen.queryByText("Ana")).toBeNull();
  });

  it("stamps the first seal after a beat", () => {
    render(<RevealSheet entries={[entry("p1", "Ana", "8")]} scale={SCALE} translate={translate} />);

    act(() => { vi.advanceTimersByTime(100); });

    expect(screen.getByText("Ana")).toBeTruthy();
    expect(sealValues().join("|")).toContain("8");
  });

  it("shows the average once every seal landed", () => {
    render(
      <RevealSheet
        entries={[entry("p1", "Ana", "3"), entry("p2", "Bruno", "8")]}
        scale={SCALE}
       
        translate={translate}
      />,
    );

    act(() => { vi.advanceTimersByTime(400); });

    expect(screen.getByText("Average")).toBeTruthy();
    expect(screen.getByText("5.5")).toBeTruthy();
  });

  it("shows the range instead of separate extremes", () => {
    render(
      <RevealSheet
        entries={[entry("p1", "Ana", "2"), entry("p2", "Bruno", "13")]}
        scale={SCALE}
        translate={translate}
      />,
    );

    act(() => { vi.advanceTimersByTime(400); });

    expect(screen.getByText("Range 2 – 13")).toBeTruthy();
  });

  it("marks an unanswered person instead of showing a zero", () => {
    render(
      <RevealSheet
        entries={[entry("p1", "Ana", null)]}
        scale={SCALE}
       
        translate={translate}
      />,
    );

    act(() => { vi.advanceTimersByTime(300); });

    expect(sealValues().join("|")).toContain("–");
  });

  it("draws the spread as one segmented bar", () => {
    render(
      <RevealSheet
        entries={[entry("p1", "Ana", "3"), entry("p2", "Bruno", "3"), entry("p3", "Carla", "13")]}
        scale={SCALE}
        translate={translate}
      />,
    );

    act(() => { vi.advanceTimersByTime(600); });

    const bar = screen.getByRole("img", { name: "How the votes spread" });
    expect(bar.children).toHaveLength(2);
  });

  it("judges how far apart the room landed", () => {
    render(
      <RevealSheet
        entries={[entry("p1", "Ana", "5"), entry("p2", "Bruno", "5")]}
        scale={SCALE}
        translate={translate}
      />,
    );

    act(() => { vi.advanceTimersByTime(400); });

    expect(screen.getByText("The room agrees")).toBeTruthy();
  });

  it("warns when the room is split", () => {
    render(
      <RevealSheet
        entries={[entry("p1", "Ana", "1"), entry("p2", "Bruno", "21")]}
        scale={SCALE}
        translate={translate}
      />,
    );

    act(() => { vi.advanceTimersByTime(400); });

    expect(screen.getByText("The room is split")).toBeTruthy();
  });

  it("leads with the average as the biggest number", () => {
    render(
      <RevealSheet
        entries={[entry("p1", "Ana", "3"), entry("p2", "Bruno", "8")]}
        scale={SCALE}
        translate={translate}
      />,
    );

    act(() => { vi.advanceTimersByTime(400); });

    const average = screen.getByText("5.5");
    expect(average.className).toContain("text-[52px]");
  });

  it("drops the sum, which was noise next to the average", () => {
    render(
      <RevealSheet
        entries={[entry("p1", "Ana", "3"), entry("p2", "Bruno", "8")]}
        scale={SCALE}
        translate={translate}
      />,
    );

    act(() => { vi.advanceTimersByTime(400); });

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("11 points")).toBeNull();
  });

  it("staggers the seals instead of showing them at once", () => {
    render(
      <RevealSheet
        entries={[entry("p1", "Ana", "8"), entry("p2", "Bruno", "13"), entry("p3", "Carla", "5")]}
        scale={SCALE}
        translate={translate}
      />,
    );

    act(() => { vi.advanceTimersByTime(10); });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);

    act(() => { vi.advanceTimersByTime(90); });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    act(() => { vi.advanceTimersByTime(100); });
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("labels someone who did not vote", () => {
    render(<RevealSheet entries={[entry("p1", "Ana", null)]} scale={SCALE} translate={translate} />);

    act(() => { vi.advanceTimersByTime(300); });

    expect(sealValues().join("|")).toContain("–");
  });

  it("shows the question mark for a discussion vote", () => {
    render(<RevealSheet entries={[entry("p1", "Ana", "?")]} scale={SCALE} translate={translate} />);

    act(() => { vi.advanceTimersByTime(300); });

    expect(sealValues().join("|")).toContain("?");
  });

  it("translates the coffee marker", () => {
    render(
      <RevealSheet
        entries={[entry("p1", "Ana", "coffee")]}
        scale={SCALE}
        translate={createTranslator("pt-BR")}
      />,
    );

    act(() => { vi.advanceTimersByTime(300); });

    expect(sealValues().join("|")).toContain("Café");
  });

  it("marks spectators", () => {
    render(
      <RevealSheet
        entries={[entry("p1", "Carla", null, "spectator")]}
        scale={SCALE}
        translate={translate}
      />,
    );

    act(() => { vi.advanceTimersByTime(300); });

    expect(sealValues().join("|")).toContain("Watching");
  });

  it("withholds the verdict until every seal landed", () => {
    render(
      <RevealSheet
        entries={[entry("p1", "Ana", "8"), entry("p2", "Bruno", "13")]}
        scale={SCALE}
        translate={translate}
      />,
    );

    act(() => { vi.advanceTimersByTime(10); });
    expect(screen.queryByText("10.5")).toBeNull();

    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.getByText("10.5")).toBeTruthy();
  });

  it("reports how many votes backed the average", () => {
    render(
      <RevealSheet
        entries={[entry("p1", "Ana", "8"), entry("p2", "Bruno", "13")]}
        scale={SCALE}
        translate={translate}
      />,
    );

    act(() => { vi.advanceTimersByTime(400); });

    expect(screen.getByText("2 of 2 votes counted")).toBeTruthy();
  });

  it("marks the sheet complete only at the end", () => {
    const { container } = render(
      <RevealSheet
        entries={[entry("p1", "Ana", "8"), entry("p2", "Bruno", "13")]}
        scale={SCALE}
        translate={translate}
      />,
    );

    act(() => { vi.advanceTimersByTime(10); });
    expect(container.querySelector("[data-complete]")?.getAttribute("data-complete")).toBe("false");

    act(() => { vi.advanceTimersByTime(300); });
    expect(container.querySelector("[data-complete]")?.getAttribute("data-complete")).toBe("true");
  });

  it("replays when the parent remounts it for a new round", () => {
    const first = render(
      <RevealSheet entries={[entry("p1", "Ana", "8")]} scale={SCALE} translate={translate} />,
    );
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText("Ana")).toBeTruthy();
    first.unmount();

    render(
      <RevealSheet entries={[entry("p1", "Ana", "13")]} scale={SCALE} translate={translate} />,
    );

    expect(screen.queryByText("Ana")).toBeNull();
  });

  it("keeps revealing entries that arrive while playing", () => {
    render(
      <RevealSheet
        entries={[entry("p1", "Ana", "8"), entry("p2", "Bruno", "13")]}
        scale={SCALE}
        translate={translate}
      />,
    );

    act(() => { vi.advanceTimersByTime(500); });

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("handles an empty room", () => {
    const { container } = render(
      <RevealSheet entries={[]} scale={SCALE} translate={translate} />,
    );

    expect(container.querySelectorAll(".seal-in")).toHaveLength(0);
  });

  it("cancels pending seals on unmount", () => {
    const { unmount } = render(
      <RevealSheet
        entries={[entry("p1", "Ana", "8"), entry("p2", "Bruno", "13")]}
        scale={SCALE}
        translate={translate}
      />,
    );

    unmount();

    expect(() => act(() => { vi.advanceTimersByTime(500); })).not.toThrow();
  });

  it("applies a per seal tilt", () => {
    const { container } = render(
      <RevealSheet
        entries={[entry("p1", "Ana", "8"), entry("p2", "Bruno", "13")]}
        scale={SCALE}
        translate={translate}
      />,
    );

    act(() => { vi.advanceTimersByTime(300); });

    const seals = container.querySelectorAll(".seal-in");
    expect(seals[0]?.getAttribute("style")).toContain("--reveal-tilt: -3deg");
    expect(seals[1]?.getAttribute("style")).toContain("--reveal-tilt: 3deg");
  });
});