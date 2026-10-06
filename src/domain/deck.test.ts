import { describe, expect, it } from "vitest";
import {
  DECK_FIBONACCI,
  DECK_LINEAR,
  DECK_TSHIRT,
  DECKS,
  DECK_IDS,
  DEFAULT_DECK_ID,
  getDeck,
  isDeckId,
  isSpecialValue,
  isVoteValue,
  pointsFor,
  voteValueKey,
} from "@domain/deck";

describe("deck", () => {
  describe("fibonacci deck", () => {
    it("contains the expected poker planning scale", () => {
      expect(DECK_FIBONACCI).toEqual([
        "0",
        "1",
        "2",
        "3",
        "5",
        "8",
        "13",
        "21",
        "?",
        "coffee",
      ]);
    });

    it("is the default deck", () => {
      expect(DEFAULT_DECK_ID).toBe("fibonacci");
    });
  });

  describe("isDeckId", () => {
    it("accepts every registered deck", () => {
      for (const deckId of DECK_IDS) {
        expect(isDeckId(deckId)).toBe(true);
      }
    });

    it("rejects unknown deck identifiers", () => {
      expect(isDeckId("nope")).toBe(false);
      expect(isDeckId("constructor")).toBe(false);
      expect(isDeckId("toString")).toBe(false);
      expect(isDeckId("")).toBe(false);
    });

    it("rejects non string values", () => {
      expect(isDeckId(null)).toBe(false);
      expect(isDeckId(42)).toBe(false);
      expect(isDeckId(undefined)).toBe(false);
      expect(isDeckId({})).toBe(false);
    });
  });

  describe("isVoteValue", () => {
    it("accepts values belonging to the current deck", () => {
      expect(isVoteValue("fibonacci", "13")).toBe(true);
      expect(isVoteValue("fibonacci", "?")).toBe(true);
      expect(isVoteValue("fibonacci", "coffee")).toBe(true);
      expect(isVoteValue("tshirt", "XL")).toBe(true);
      expect(isVoteValue("linear", "7")).toBe(true);
    });

    it("rejects values from a different deck", () => {
      expect(isVoteValue("tshirt", "13")).toBe(false);
      expect(isVoteValue("linear", "coffee")).toBe(false);
      expect(isVoteValue("fibonacci", "XL")).toBe(false);
    });

    it("rejects values outside the deck range", () => {
      expect(isVoteValue("linear", "11")).toBe(false);
      expect(isVoteValue("linear", "0")).toBe(false);
    });

    it("rejects non string values", () => {
      expect(isVoteValue("fibonacci", null)).toBe(false);
      expect(isVoteValue("fibonacci", 5)).toBe(false);
      expect(isVoteValue("fibonacci", undefined)).toBe(false);
    });
  });

  describe("getDeck", () => {
    it("returns the registered values for each deck", () => {
      expect(getDeck("tshirt")).toEqual(DECK_TSHIRT);
      expect(getDeck("linear")).toEqual(DECK_LINEAR);
      expect(getDeck("fibonacci")).toEqual(DECK_FIBONACCI);
    });

    it("exposes all decks", () => {
      expect(Object.keys(DECKS)).toEqual(DECK_IDS);
    });
  });

  describe("pointsFor", () => {
    it("parses numeric values", () => {
      expect(pointsFor("0")).toBe(0);
      expect(pointsFor("1")).toBe(1);
      expect(pointsFor("13")).toBe(13);
      expect(pointsFor("21")).toBe(21);
    });

    it("treats the question mark as needing discussion", () => {
      expect(pointsFor("?")).toBeNull();
    });

    it("treats coffee as zero points", () => {
      expect(pointsFor("coffee")).toBe(0);
    });

    it("returns null for non numeric labels", () => {
      expect(pointsFor("XL")).toBeNull();
      expect(pointsFor("")).toBeNull();
    });
  });

  describe("isSpecialValue", () => {
    it("detects the non numeric markers", () => {
      expect(isSpecialValue("?")).toBe(true);
      expect(isSpecialValue("coffee")).toBe(true);
    });

    it("treats plain numbers as regular values", () => {
      expect(isSpecialValue("3")).toBe(false);
      expect(isSpecialValue("XL")).toBe(false);
    });
  });

  describe("voteValueKey", () => {
    it("maps coffee to its own translation key", () => {
      expect(voteValueKey("coffee")).toBe("vote.coffee");
    });

    it("maps every other value to the vote namespace", () => {
      expect(voteValueKey("13")).toBe("vote.13");
      expect(voteValueKey("?")).toBe("vote.?");
      expect(voteValueKey("XL")).toBe("vote.XL");
    });
  });
});