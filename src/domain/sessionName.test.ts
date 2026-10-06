import { describe, expect, it } from "vitest";
import {
  SESSION_NAME_MAX_LENGTH,
  isValidSessionName,
  normalizeSessionName,
  validateSessionName,
} from "@domain/sessionName";

describe("validateSessionName", () => {
  it("accepts an ordinary title", () => {
    expect(validateSessionName("Sprint 42 planning")).toEqual({
      valid: true,
      name: "Sprint 42 planning",
    });
  });

  it("accepts punctuation a topic naturally uses", () => {
    expect(isValidSessionName("Q3 — Hiring: what next?")).toBe(true);
  });

  it("trims and collapses whitespace", () => {
    expect(normalizeSessionName("  Sprint   42  ")).toBe("Sprint 42");
  });

  it("refuses an empty name", () => {
    expect(validateSessionName("   ")).toEqual({ valid: false, reason: "empty" });
  });

  it("refuses a name past the limit", () => {
    const tooLong = "x".repeat(SESSION_NAME_MAX_LENGTH + 1);
    expect(validateSessionName(tooLong)).toEqual({ valid: false, reason: "too_long" });
  });

  it("accepts a name exactly at the limit", () => {
    const exact = "x".repeat(SESSION_NAME_MAX_LENGTH);
    expect(isValidSessionName(exact)).toBe(true);
  });

  it("refuses a zero width space, which reads as nothing", () => {
    expect(validateSessionName("Sprint\u200b42")).toEqual({
      valid: false,
      reason: "invalid_characters",
    });
  });

  it("folds a newline into a space rather than refusing the title", () => {
    expect(validateSessionName("Sprint\n42")).toEqual({ valid: true, name: "Sprint 42" });
  });

  it("refuses a bidi override, which would reorder the title when read", () => {
    expect(validateSessionName("Sprint\u202e42")).toEqual({
      valid: false,
      reason: "invalid_characters",
    });
  });

  it("normalizes accents before counting", () => {
    expect(isValidSessionName("Planejamento — Sprint 42")).toBe(true);
  });
});