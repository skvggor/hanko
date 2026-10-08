import { describe, expect, it } from "vitest";
import { isRoomId, ROOM_ID_ALPHABET, ROOM_ID_LENGTH } from "@domain/roomId";

describe("room id", () => {
  it("leaves out the characters people mistype for each other", () => {
    // i and l, l and 1, o and 0. A room id is read aloud and copied by hand, so an
    // alphabet that renders those four ambiguously spends a share of every link on a
    // coin flip.
    for (const character of ["i", "l", "o", "0", "1"]) {
      expect(ROOM_ID_ALPHABET).not.toContain(character);
    }
  });

  it("has enough characters that a room id cannot be guessed", () => {
    expect(ROOM_ID_ALPHABET.length).toBeGreaterThan(28);
  });

  it("uses a length nobody has to count", () => {
    expect(ROOM_ID_LENGTH).toBe(8);
  });

  it("accepts an id built only from the alphabet", () => {
    expect(isRoomId("abcd2345")).toBe(true);
    expect(isRoomId("k7f2mq9x")).toBe(true);
  });

  // Regression: routing and the Worker each validated room ids with their own copy of
  // [a-z0-9], which accepted five characters the generator can never produce. So
  // /room/texto opened a room that no link the app hands out could ever point at.
  it("rejects an id carrying a character the generator never draws", () => {
    for (const id of ["texto", "il0o1xyz", "h3ll0", "sala10"]) {
      expect(isRoomId(id)).toBe(false);
    }
  });

  it("rejects the ambiguous characters wherever they fall", () => {
    expect(isRoomId("0abcd234")).toBe(false);
    expect(isRoomId("abcd2340")).toBe(false);
  });

  it("rejects an id of the wrong length", () => {
    expect(isRoomId("abc1234")).toBe(false);
    expect(isRoomId("abc123456")).toBe(false);
    expect(isRoomId("")).toBe(false);
  });

  it("rejects uppercase, so one room cannot be spelled two ways", () => {
    // Accepting both cases would mean /room/ABCD2345 and /room/abcd2345 are two
    // different rooms behind one link.
    expect(isRoomId("ABCD2345")).toBe(false);
  });

  it("rejects punctuation and path separators", () => {
    expect(isRoomId("abc-2345")).toBe(false);
    expect(isRoomId("abc/234")).toBe(false);
    expect(isRoomId("abc 234")).toBe(false);
    expect(isRoomId("../etc")).toBe(false);
  });
});