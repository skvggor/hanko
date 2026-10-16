import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "@infra/origin";
import { InMemoryRateLimiter } from "@infra/rateLimit";

describe("isAllowedOrigin", () => {
  const request = (origin: string | null, host = "hanko.skvggor.workers.dev") =>
    new Request("https://hanko.skvggor.workers.dev/api/room/abc12345/socket", {
      headers: origin === null ? {} : { origin, host },
    });

  it("allows a same origin handshake", () => {
    expect(isAllowedOrigin(request("https://hanko.skvggor.workers.dev"))).toBe(true);
  });

  it("refuses a cross site handshake", () => {
    expect(isAllowedOrigin(request("https://evil.example"))).toBe(false);
  });

  it("refuses a subdomain of the site", () => {
    expect(isAllowedOrigin(request("https://hanko.skvggor.workers.dev.evil.example"))).toBe(false);
  });

  it("refuses a port mismatch on the same host", () => {
    expect(isAllowedOrigin(request("https://hanko.skvggor.workers.dev:8443"))).toBe(false);
  });

  it("allows a client that sends no origin at all", () => {
    expect(isAllowedOrigin(request(null))).toBe(true);
  });

  it("refuses an origin that is not a url", () => {
    expect(isAllowedOrigin(request("not-a-url"))).toBe(false);
  });

  it("allows when the host header is absent", () => {
    const bare = new Request("https://hanko.skvggor.workers.dev/socket", {
      headers: { origin: "https://hanko.skvggor.workers.dev" },
    });
    expect(isAllowedOrigin(bare)).toBe(true);
  });
});

describe("RateWindow", () => {
  it("allows up to the limit inside one window", () => {
    const limiter = new InMemoryRateLimiter(3, 1000);

    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 10)).toBe(true);
    expect(limiter.allow("a", 20)).toBe(true);
    expect(limiter.allow("a", 30)).toBe(false);
  });

  it("starts a fresh window once the old one lapses", () => {
    const limiter = new InMemoryRateLimiter(2, 1000);

    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 0)).toBe(false);
    expect(limiter.allow("a", 1000)).toBe(true);
  });

  it("keeps separate budgets per key", () => {
    const limiter = new InMemoryRateLimiter(1, 1000);

    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("b", 0)).toBe(true);
    expect(limiter.allow("a", 0)).toBe(false);
  });

  it("reports at least a second to wait", () => {
    const limiter = new InMemoryRateLimiter(1, 5000);
    limiter.allow("a", 0);
    expect(limiter.retryAfterSeconds("a", 0)).toBe(5);
  });

  it("caps the key count so it cannot grow without bound", () => {
    const limiter = new InMemoryRateLimiter(5, 60_000, 3);

    for (let index = 0; index < 50; index += 1) limiter.allow(`k${index}`, 0);

    expect(() => limiter.allow("later", 0)).not.toThrow();
  });

  it("keeps a key's budget to itself", () => {
    const limiter = new InMemoryRateLimiter(1, 1000);

    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 0)).toBe(false);
    expect(limiter.allow("b", 0)).toBe(true);
  });

  it("answers a blocked caller with a wait worth quoting", () => {
    const limiter = new InMemoryRateLimiter(1, 10_000);

    limiter.allow("a", 0);
    limiter.allow("a", 0);

    // The refusal carries a number the caller can act on, so it must be a real
    // number of seconds rather than the fallback.
    expect(limiter.retryAfterSeconds("a", 0)).toBe(10);
  });

  it("counts down the wait as the window runs out", () => {
    const limiter = new InMemoryRateLimiter(1, 10_000);

    limiter.allow("a", 0);
    limiter.allow("a", 0);

    expect(limiter.retryAfterSeconds("a", 6_000)).toBe(4);
  });

  it("answers a caller it has never seen with the shortest wait", () => {
    const limiter = new InMemoryRateLimiter(1, 10_000);

    expect(limiter.retryAfterSeconds("stranger", 0)).toBe(1);
  });
});