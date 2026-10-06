import { describe, expect, it } from "vitest";
import { readConsensus, tallyReveals } from "@domain/tally";

const SCALE = ["0", "1", "2", "3", "5", "8", "13", "21", "?", "coffee"] as const;

type Entry = Parameters<typeof tallyReveals>[0][number];

function entry(
  participantId: string,
  name: string,
  vote: string | null,
  role: Entry["role"] = "voter",
  points: number | null = null,
): Entry {
  return {
    participantId,
    name,
    role,
    vote,
    points: points ?? (vote === null || vote === "?" || vote === "coffee" ? null : Number(vote)),
  };
}

describe("tallyReveals", () => {
  it("reports nothing for an empty room", () => {
    const result = tallyReveals([], SCALE);

    expect(result.counted).toBe(0);
    expect(result.average).toBeNull();
    expect(result.total).toBe(0);
    expect(result.min).toBeNull();
    expect(result.max).toBeNull();
    expect(result.range).toBeNull();
    expect(result.everyoneVoted).toBe(false);
  });

  it("averages the counted points", () => {
    const result = tallyReveals(
      [entry("a", "Ana", "3"), entry("b", "Bruno", "8")],
      SCALE,
    );

    expect(result.average).toBe(5.5);
    expect(result.total).toBe(11);
    expect(result.counted).toBe(2);
  });

  it("rounds the average to one decimal", () => {
    const result = tallyReveals(
      [entry("a", "Ana", "1"), entry("b", "Bruno", "2"), entry("c", "Carla", "2")],
      SCALE,
    );

    expect(result.average).toBe(1.7);
  });

  it("reports the extremes and the spread", () => {
    const result = tallyReveals(
      [entry("a", "Ana", "2"), entry("b", "Bruno", "13")],
      SCALE,
    );

    expect(result.min).toBe(2);
    expect(result.max).toBe(13);
    expect(result.range).toBe(11);
  });

  it("leaves out anyone who did not vote", () => {
    const result = tallyReveals(
      [entry("a", "Ana", "5"), entry("b", "Bruno", null)],
      SCALE,
    );

    expect(result.average).toBe(5);
    expect(result.pending).toBe(1);
    expect(result.everyoneVoted).toBe(false);
  });

  it("leaves out watchers", () => {
    const result = tallyReveals(
      [entry("a", "Ana", "5"), entry("b", "Bruno", null, "spectator")],
      SCALE,
    );

    expect(result.counted).toBe(1);
    expect(result.average).toBe(5);
    expect(result.pending).toBe(1);
  });

  it("never lets a watcher skew the average", () => {
    const result = tallyReveals(
      [
        entry("a", "Ana", "2"),
        entry("b", "Bruno", "4"),
        entry("c", "Carla", "100", "spectator"),
      ],
      SCALE,
    );

    expect(result.average).toBe(3);
  });

  it("counts a discussion vote separately", () => {
    const result = tallyReveals(
      [entry("a", "Ana", "5"), entry("b", "Bruno", "?")],
      SCALE,
    );

    expect(result.needsDiscussion).toBe(1);
    expect(result.counted).toBe(1);
    expect(result.average).toBe(5);
  });

  it("counts coffee separately", () => {
    const result = tallyReveals(
      [entry("a", "Ana", "5"), entry("b", "Bruno", "coffee")],
      SCALE,
    );

    expect(result.coffee).toBe(1);
    expect(result.counted).toBe(1);
  });

  it("treats coffee and discussion as answered", () => {
    const result = tallyReveals(
      [
        entry("a", "Ana", "5"),
        entry("b", "Bruno", "?"),
        entry("c", "Carla", "coffee"),
      ],
      SCALE,
    );

    expect(result.everyoneVoted).toBe(true);
    expect(result.pending).toBe(0);
  });

  it("builds the distribution in scale order", () => {
    const result = tallyReveals(
      [entry("a", "Ana", "13"), entry("b", "Bruno", "3"), entry("c", "Carla", "3")],
      SCALE,
    );

    expect(result.distribution).toEqual([
      { value: "3", count: 2 },
      { value: "13", count: 1 },
    ]);
  });

  it("omits values nobody chose", () => {
    const result = tallyReveals([entry("a", "Ana", "8")], SCALE);

    expect(result.distribution).toEqual([{ value: "8", count: 1 }]);
  });

  it("includes discussion and coffee in the distribution", () => {
    const result = tallyReveals(
      [entry("a", "Ana", "8"), entry("b", "Bruno", "?"), entry("c", "Carla", "coffee")],
      SCALE,
    );

    expect(result.distribution.map((row) => row.value)).toEqual(["8", "?", "coffee"]);
  });

  it("shares how much of the room has voted", () => {
    const result = tallyReveals(
      [
        entry("a", "Ana", "3"),
        entry("b", "Bruno", "3"),
        entry("c", "Carla", "3"),
        entry("d", "Dan", null),
      ],
      SCALE,
    );

    expect(result.votedShare).toBe(0.75);
  });

  it("marks a full room as complete", () => {
    const result = tallyReveals(
      [entry("a", "Ana", "3"), entry("b", "Bruno", "5")],
      SCALE,
    );

    expect(result.everyoneVoted).toBe(true);
    expect(result.votedShare).toBe(1);
  });

  it("keeps the entries it was given", () => {
    const entries = [entry("a", "Ana", "3")];
    expect(tallyReveals(entries, SCALE).entries).toBe(entries);
  });

  it("handles a scale with no matching values", () => {
    const result = tallyReveals([entry("a", "Ana", "3")], ["XL", "XXL"]);

    expect(result.average).toBe(3);
    expect(result.distribution).toEqual([]);
  });
});
describe("readConsensus", () => {
  it("calls a single vote aligned", () => {
    expect(readConsensus([5])).toBe("aligned");
  });

  it("calls an empty room aligned", () => {
    expect(readConsensus([])).toBe("aligned");
  });

  it("calls an identical room aligned", () => {
    expect(readConsensus([5, 5, 5])).toBe("aligned");
  });

  it("calls a tight cluster close", () => {
    expect(readConsensus([3, 3, 5])).toBe("close");
  });

  it("calls a tight cluster aligned", () => {
    expect(readConsensus([5, 5, 5, 6])).toBe("aligned");
  });

  it("calls a wide room split", () => {
    expect(readConsensus([1, 13, 21])).toBe("split");
  });

  it("calls 3, 8 and 10 split rather than close", () => {
    // Regression: span over mean scored exactly 1 here, which sat on the "close"
    // side of the threshold and read as near agreement for a room that clearly
    // disagrees.
    expect(readConsensus([3, 8, 10])).toBe("split");
  });

  it("calls 5, 8 and 13 split", () => {
    expect(readConsensus([5, 8, 13])).toBe("split");
  });

  it("keeps 5 against 8 close on Fibonacci", () => {
    expect(readConsensus([5, 8])).toBe("close");
  });

  it("keeps 13 against 21 close", () => {
    expect(readConsensus([13, 13, 21])).toBe("close");
  });

  it("calls a gap that equals the mean a split", () => {
    expect(readConsensus([0, 2, 4])).toBe("split");
  });

  it("calls zero against a real number a split", () => {
    // Relative to a mean this low, one person saying "two" really is a different view.
    expect(readConsensus([0, 0, 2])).toBe("split");
  });

  it("calls an all zero room aligned", () => {
    expect(readConsensus([0, 0, 0])).toBe("aligned");
  });

  it("judges through the tally so the sheet reads it", () => {
    const result = tallyReveals(
      [entry("a", "Ana", "3"), entry("b", "Bruno", "5")],
      SCALE,
    );

    expect(result.consensus).toBe("close");
  });

  it("reports a split room", () => {
    const result = tallyReveals(
      [entry("a", "Ana", "1"), entry("b", "Bruno", "21")],
      SCALE,
    );

    expect(result.consensus).toBe("split");
  });
});
