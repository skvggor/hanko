import { describe, expect, it } from "vitest";
import { parseRoute, roomPath } from "@application/routing";

describe("parseRoute", () => {
  it("routes the root to the home screen", () => {
    expect(parseRoute("/")).toEqual({ kind: "home" });
  });

  it("routes a room path", () => {
    expect(parseRoute("/room/abc12345")).toEqual({
      kind: "room",
      roomId: "abc12345",
    });
  });

  it("ignores a trailing slash", () => {
    expect(parseRoute("/room/abc12345/")).toEqual({
      kind: "room",
      roomId: "abc12345",
    });
  });

  it("routes a room with a nested path to the room", () => {
    expect(parseRoute("/room/abc12345/something")).toEqual({
      kind: "room",
      roomId: "abc12345",
    });
  });

  it("routes a missing room id to home", () => {
    expect(parseRoute("/room")).toEqual({ kind: "home" });
    expect(parseRoute("/room/")).toEqual({ kind: "home" });
  });

  it("routes an invalid room id to home", () => {
    expect(parseRoute("/room/AB")).toEqual({ kind: "home" });
    expect(parseRoute(`/room/${"a".repeat(33)}`)).toEqual({ kind: "home" });
    expect(parseRoute("/room/abc!")).toEqual({ kind: "home" });
  });

  it("routes an unknown path to home", () => {
    expect(parseRoute("/whatever")).toEqual({ kind: "home" });
  });

  it("accepts the shortest valid room id", () => {
    expect(parseRoute("/room/abcd")).toEqual({ kind: "room", roomId: "abcd" });
  });

  it("accepts the longest valid room id", () => {
    const roomId = "a".repeat(32);
    expect(parseRoute(`/room/${roomId}`)).toEqual({ kind: "room", roomId });
  });

  it("rejects an id longer than the limit", () => {
    expect(parseRoute(`/room/${"a".repeat(33)}`)).toEqual({ kind: "home" });
  });
});

describe("roomPath", () => {
  it("builds the shareable path", () => {
    expect(roomPath("abc12345")).toBe("/room/abc12345");
  });

  it("round trips through the parser", () => {
    expect(parseRoute(roomPath("k7f2mq9x"))).toEqual({
      kind: "room",
      roomId: "k7f2mq9x",
    });
  });
});