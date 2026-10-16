import { describe, expect, it } from "vitest";
import { InMemoryRateLimiter, RateWindow } from "@infra/rateLimit";

describe("RateWindow", () => {
  it("hands out the slots it was given", () => {
    const window = new RateWindow(2, 1000);

    expect(window.take(0)).toBe(true);
    expect(window.take(0)).toBe(true);
    expect(window.take(0)).toBe(false);
  });

  it("starts a new window once the old one is over", () => {
    const window = new RateWindow(1, 1000);

    expect(window.take(0)).toBe(true);
    expect(window.take(999)).toBe(false);
    expect(window.take(1000)).toBe(true);
  });

  it("counts down to the next free slot", () => {
    const window = new RateWindow(1, 10_000);

    expect(window.retryAfterSeconds(0)).toBe(10);
    expect(window.retryAfterSeconds(4_000)).toBe(6);
  });

  it("never quotes less than a second", () => {
    const window = new RateWindow(1, 1000);

    // A caller told to retry in zero seconds would hammer the endpoint it was
    // just refused by, so the answer rounds up rather than down.
    expect(window.retryAfterSeconds(999)).toBe(1);
  });
});

describe("InMemoryRateLimiter", () => {
  it("refuses past the limit and recovers on the next window", () => {
    const limiter = new InMemoryRateLimiter(2, 1000);

    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 0)).toBe(false);
    expect(limiter.allow("a", 1000)).toBe(true);
  });

  it("gives every key its own budget", () => {
    const limiter = new InMemoryRateLimiter(1, 1000);

    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("b", 0)).toBe(true);
    expect(limiter.allow("a", 0)).toBe(false);
  });

  it("drops the oldest key rather than growing past the cap", () => {
    const limiter = new InMemoryRateLimiter(1, 60_000, 2);

    limiter.allow("a", 0);
    limiter.allow("b", 0);

    // At the cap, so "a" is dropped to make room. A caller arriving past the cap is
    // still served rather than refused, because the ceiling exists to bound memory
    // and not to lock out whoever happens to turn up last.
    expect(limiter.allow("c", 0)).toBe(true);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("b", 0)).toBe(true);
  });

  it("quotes the wait of the caller that was refused", () => {
    const limiter = new InMemoryRateLimiter(1, 10_000);

    limiter.allow("a", 0);
    limiter.allow("a", 0);

    expect(limiter.retryAfterSeconds("a", 0)).toBe(10);
  });
});