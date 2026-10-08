import { describe, expect, it } from "vitest";
import { parseRoute, roomPath } from "@application/routing";

describe("parseRoute", () => {
  it("routes the root to the home screen", () => {
    expect(parseRoute("/")).toEqual({ kind: "home" });
  });

  it("routes a room path", () => {
    expect(parseRoute("/room/abcd2345")).toEqual({
      kind: "room",
      roomId: "abcd2345",
    });
  });

  it("ignores a trailing slash", () => {
    expect(parseRoute("/room/abcd2345/")).toEqual({
      kind: "room",
      roomId: "abcd2345",
    });
  });

  it("routes a room with a nested path to the room", () => {
    expect(parseRoute("/room/abcd2345/something")).toEqual({
      kind: "room",
      roomId: "abcd2345",
    });
  });

  it("routes a missing room id to the not found screen", () => {
    expect(parseRoute("/room")).toEqual({ kind: "missing-room" });
    expect(parseRoute("/room/")).toEqual({ kind: "missing-room" });
  });

  // Regression: an invalid room id used to fall back to the home screen, so following
  // a bad link looked exactly like the app resetting on you. It now says what happened.
  it("routes an invalid room id to the not found screen", () => {
    expect(parseRoute("/room/AB")).toEqual({ kind: "missing-room" });
    expect(parseRoute(`/room/${"a".repeat(33)}`)).toEqual({ kind: "missing-room" });
    expect(parseRoute("/room/abc!")).toEqual({ kind: "missing-room" });
  });

  it("routes a room id the generator could never produce to not found", () => {
    expect(parseRoute("/room/texto")).toEqual({ kind: "missing-room" });
    expect(parseRoute("/room/il0o")).toEqual({ kind: "missing-room" });
    expect(parseRoute("/room/sala10")).toEqual({ kind: "missing-room" });
  });

  it("routes an unknown path to home", () => {
    expect(parseRoute("/whatever")).toEqual({ kind: "home" });
  });

  it("routes an id of the wrong length to not found", () => {
    expect(parseRoute("/room/abcd")).toEqual({ kind: "missing-room" });
    expect(parseRoute(`/room/${"a".repeat(32)}`)).toEqual({ kind: "missing-room" });
    expect(parseRoute(`/room/${"a".repeat(9)}`)).toEqual({ kind: "missing-room" });
  });
});

describe("roomPath", () => {
  it("builds the shareable path", () => {
    expect(roomPath("abcd2345")).toBe("/room/abcd2345");
  });

  it("round trips through the parser", () => {
    expect(parseRoute(roomPath("k7f2mq9x"))).toEqual({
      kind: "room",
      roomId: "k7f2mq9x",
    });
  });
});