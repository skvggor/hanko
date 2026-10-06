import { describe, expect, it } from "vitest";
import {
  NAME_MAX_LENGTH,
  isValidName,
  normalizeName,
  validateName,
} from "@domain/name";

describe("normalizeName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeName("  Ana  ")).toBe("Ana");
  });

  it("collapses repeated inner whitespace", () => {
    expect(normalizeName("Ana   Paula")).toBe("Ana Paula");
  });

  it("composes accents to a single normalization form", () => {
    expect(normalizeName("Jose\u0301")).toBe(normalizeName("José"));
    expect(normalizeName("Jose\u0301").length).toBe(4);
  });

  it("keeps inner single spaces", () => {
    expect(normalizeName("Ana Paula")).toBe("Ana Paula");
  });
});

describe("validateName", () => {
  it("accepts plain ascii text", () => {
    const result = validateName("Ana");
    expect(result).toEqual({ valid: true, name: "Ana" });
  });

  it("accepts accented text", () => {
    expect(validateName("João").valid).toBe(true);
    expect(validateName("Müller").valid).toBe(true);
  });

  it("accepts non latin scripts", () => {
    expect(validateName("陈").valid).toBe(true);
    expect(validateName("Светa").valid).toBe(true);
    expect(validateName("たろう").valid).toBe(true);
  });

  it("accepts inner spaces", () => {
    expect(validateName("Ana Paula Souza").valid).toBe(true);
  });

  it("trims before validating", () => {
    expect(validateName("   Ana   ")).toEqual({ valid: true, name: "Ana" });
  });

  it("rejects an empty or whitespace only name", () => {
    expect(validateName("")).toEqual({ valid: false, reason: "empty" });
    expect(validateName("    ")).toEqual({ valid: false, reason: "empty" });
  });

  it("rejects names longer than the limit", () => {
    const tooLong = "a".repeat(NAME_MAX_LENGTH + 1);
    expect(validateName(tooLong)).toEqual({ valid: false, reason: "too_long" });
  });

  it("accepts a name exactly at the limit", () => {
    const atLimit = "a".repeat(NAME_MAX_LENGTH);
    expect(validateName(atLimit).valid).toBe(true);
  });

  it("rejects symbols", () => {
    expect(validateName("Ana@")).toEqual({
      valid: false,
      reason: "invalid_characters",
    });
    expect(validateName("<script>")).toMatchObject({ valid: false });
    expect(validateName("100%").valid).toBe(false);
  });

  it("rejects digits", () => {
    expect(validateName("Ana2").valid).toBe(false);
    expect(validateName("007").valid).toBe(false);
  });

  it("rejects punctuation and hyphens", () => {
    expect(validateName("ana-paula").valid).toBe(false);
    expect(validateName("ana_paula").valid).toBe(false);
    expect(validateName("ana.paula").valid).toBe(false);
  });

  it("rejects emoji", () => {
    expect(validateName("Ana 🎌").valid).toBe(false);
  });

  it("rejects mixed content where only part is letters", () => {
    expect(validateName("Ana Maria!").valid).toBe(false);
    expect(validateName("!Ana").valid).toBe(false);
  });

  it("accepts combining marks used by composed scripts", () => {
    expect(validateName("ཱི").valid).toBe(true);
  });
});

describe("isValidName", () => {
  it("mirrors validateName", () => {
    expect(isValidName("Ana")).toBe(true);
    expect(isValidName("")).toBe(false);
  });
});