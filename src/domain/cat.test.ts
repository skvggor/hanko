import { describe, expect, it } from "vitest";
import {
  CAT_BREEDS,
  CAT_INACTIVITY_MS,
  breedForParticipantId,
  isCatBreed,
  type EdgeSpot,
  spreadAlongTheEdges,
} from "@domain/cat";

describe("breedForParticipantId", () => {
  it("returns a known breed for any participant id", () => {
    for (let index = 0; index < 20; index += 1) {
      const id = `p${index}`;
      const breed = breedForParticipantId(id);

      expect(CAT_BREEDS).toContain(breed);
    }
  });

  it("is deterministic for the same id", () => {
    const id = "participant-123";

    expect(breedForParticipantId(id)).toBe(breedForParticipantId(id));
  });

  it("spreads breeds across different ids", () => {
    const breeds = new Set(
      Array.from({ length: 50 }, (_, index) => breedForParticipantId(`id-${index}`)),
    );

    expect(breeds.size).toBeGreaterThan(1);
  });
});

describe("isCatBreed", () => {
  it("accepts known breeds", () => {
    for (const breed of CAT_BREEDS) {
      expect(isCatBreed(breed)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isCatBreed("poodle")).toBe(false);
    expect(isCatBreed(42)).toBe(false);
    expect(isCatBreed(null)).toBe(false);
  });
});

describe("CAT_INACTIVITY_MS", () => {
  it("gives a full minute before the cat sleeps", () => {
    expect(CAT_INACTIVITY_MS).toBe(60_000);
  });
});

/**
 * Where the shoo puts them. The requirement is not that they end up at a tidy angle
 * of the maths, it is that whatever the shape of the screen and however many cats
 * there are, none of them finishes up over the thing people came here to read.
 */
describe("spreadAlongTheEdges", () => {
  const WIDE = 16 / 9;
  const TALL = 9 / 16;

  /** The middle of the screen is the vote grid, and it must come out empty. */
  function overTheMiddle(spot: EdgeSpot): boolean {
    return spot.x > 0.35 && spot.x < 0.65 && spot.y > 0.25 && spot.y < 0.75;
  }

  it("has nowhere to put nobody", () => {
    expect(spreadAlongTheEdges(0, WIDE)).toEqual([]);
  });

  it("reads nothing out of a count that is not a number", () => {
    expect(spreadAlongTheEdges(Number.NaN, WIDE)).toEqual([]);
  });

  it("puts a lone cat against the wall", () => {
    const [spot] = spreadAlongTheEdges(1, WIDE);

    expect(spot).toBeDefined();
    const nearest = Math.min(spot!.x, 1 - spot!.x, spot!.y, 1 - spot!.y);
    expect(nearest).toBeLessThan(0.08);
  });

  it("keeps every cat off the middle of the screen", () => {
    for (const aspect of [WIDE, 1, TALL, 3.4]) {
      const spots = spreadAlongTheEdges(12, aspect);

      for (const spot of spots) {
        expect(overTheMiddle(spot)).toBe(false);
      }
    }
  });

  it("keeps every cat on the screen it is drawn on", () => {
    for (const aspect of [WIDE, 1, TALL, 3.4]) {
      for (const spot of spreadAlongTheEdges(20, aspect)) {
        expect(spot.x).toBeGreaterThanOrEqual(0);
        expect(spot.x).toBeLessThanOrEqual(1);
        expect(spot.y).toBeGreaterThanOrEqual(0);
        expect(spot.y).toBeLessThanOrEqual(1);
      }
    }
  });

  /**
   * One corner with everybody in it would still be a pile in the way, and the collision
   * rule would have them all angry at each other on top of that.
   */
  it("does not stack the cats on top of one another", () => {
    const spots = spreadAlongTheEdges(16, WIDE);
    const seen = new Set(spots.map((spot) => `${spot.x.toFixed(4)},${spot.y.toFixed(4)}`));

    expect(seen.size).toBe(spots.length);
  });

  it("copes with a screen nobody could have", () => {
    for (const aspect of [0, -3, Number.POSITIVE_INFINITY, Number.NaN]) {
      for (const spot of spreadAlongTheEdges(4, aspect)) {
        expect(spot.x).toBeGreaterThanOrEqual(0);
        expect(spot.x).toBeLessThanOrEqual(1);
        expect(spot.y).toBeGreaterThanOrEqual(0);
        expect(spot.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it("turns the cats to face back into the room", () => {
    const spots = spreadAlongTheEdges(8, WIDE);

    for (const spot of spots) {
      const facesInward = spot.x < 0.5 ? spot.direction === "right" : spot.direction === "left";
      expect(facesInward).toBe(true);
    }
  });

  it("never wears a cat out walking it the same way twice", () => {
    // Two shoos in a row move nobody anywhere new, which is what tells a person that
    // the button is a nudge and not a rule.
    const first = spreadAlongTheEdges(6, WIDE);
    const second = spreadAlongTheEdges(6, WIDE);

    expect(second).toEqual(first);
  });
});
