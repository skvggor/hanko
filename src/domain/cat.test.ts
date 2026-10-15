import { describe, expect, it } from "vitest";
import {
  CAT_BREEDS,
  CAT_INACTIVITY_MS,
  breedForParticipantId,
  isCatBreed,
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
