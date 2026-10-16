import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "@infra/origin";

function request(headers: Record<string, string>): Request {
  return new Request("https://room.internal/socket", { headers });
}

describe("isAllowedOrigin", () => {
  /**
   * This is the cross site WebSocket hijack guard. Any page on any origin can open a
   * socket to a room whose id it has learned, and the room has no accounts, so the
   * socket is the whole of the person's access. Refusing an Origin that is not ours
   * closes that door.
   */
  it("refuses a socket from another site", () => {
    expect(
      isAllowedOrigin(
        request({
          host: "hanko.skvggor.workers.dev",
          origin: "https://evil.example",
        }),
      ),
    ).toBe(false);
  });

  it("allows a socket from the room's own site", () => {
    expect(
      isAllowedOrigin(
        request({
          host: "hanko.skvggor.workers.dev",
          origin: "https://hanko.skvggor.workers.dev",
        }),
      ),
    ).toBe(true);
  });

  it("compares the host rather than the whole origin", () => {
    // The scheme is not part of the comparison, because the host is what Cloudflare
    // forwards and what the browser compared against in the first place.
    expect(
      isAllowedOrigin(
        request({
          host: "hanko.skvggor.workers.dev",
          origin: "wss://hanko.skvggor.workers.dev",
        }),
      ),
    ).toBe(true);
  });

  it("treats another port on the same host as somewhere else", () => {
    // A host includes its port, so this is a different authority and refused. Said
    // out loud because it is the part of the comparison that is easy to assume away.
    expect(
      isAllowedOrigin(
        request({
          host: "hanko.skvggor.workers.dev",
          origin: "https://hanko.skvggor.workers.dev:8787",
        }),
      ),
    ).toBe(false);
  });

  it("refuses an origin that is not a url at all", () => {
    expect(
      isAllowedOrigin(request({ host: "hanko.skvggor.workers.dev", origin: "not a url" })),
    ).toBe(false);
  });

  /**
   * A browser always sends Origin on a WebSocket handshake, so a request without one
   * is a non browser client rather than a cross site one. Refusing it would lock out
   * curl, the test suite and the app's own same origin calls for no gain.
   */
  it("allows a request that carries no origin", () => {
    expect(isAllowedOrigin(request({ host: "hanko.skvggor.workers.dev" }))).toBe(true);
  });

  it("allows a request whose host was not forwarded", () => {
    // Without the public host there is nothing to compare against, and the origin
    // check has already been given nothing to work with.
    expect(isAllowedOrigin(request({ origin: "https://hanko.skvggor.workers.dev" }))).toBe(true);
  });
});