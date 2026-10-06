/**
 * A fixed window counter, which is all the abuse control this needs: it bounds
 * how much work a single socket can ask for per second, which is the property
 * that matters for cost. Bursts inside the window are allowed up to the limit
 * and the counter resets on the window boundary.
 */
export class RateWindow {
  #count = 0;
  #windowStart = 0;

  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {}

  /** Takes one slot if one is left in the current window. */
  take(now: number): boolean {
    if (now - this.#windowStart >= this.windowMs) {
      this.#windowStart = now;
      this.#count = 0;
    }

    if (this.#count >= this.limit) return false;

    this.#count += 1;
    return true;
  }

  /** Seconds until the next slot frees up. */
  retryAfterSeconds(now: number): number {
    const elapsed = now - this.#windowStart;
    return Math.max(1, Math.ceil((this.windowMs - elapsed) / 1000));
  }
}

export interface RateLimit {
  allow(key: string, now: number): boolean;
  retryAfterSeconds(key: string, now: number): number;
}

/**
 * Rate limits held per key in memory. Durable Object instances are single
 * threaded and evicted between requests, so this is per instance and resets on
 * eviction, which is the right trade for bounding a live flood.
 */
export class InMemoryRateLimiter implements RateLimit {
  readonly #windows = new Map<string, RateWindow>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    readonly maxKeys = 500,
  ) {}

  allow(key: string, now: number): boolean {
    const existing = this.#windows.get(key);

    if (existing === undefined) {
      if (this.#windows.size >= this.maxKeys) this.#evictOldest();
      this.#windows.set(key, new RateWindow(this.limit, this.windowMs));
      return this.#windows.get(key)?.take(now) ?? false;
    }

    return existing.take(now);
  }

  retryAfterSeconds(key: string, now: number): number {
    return this.#windows.get(key)?.retryAfterSeconds(now) ?? 1;
  }

  forget(key: string): void {
    this.#windows.delete(key);
  }

  #evictOldest(): void {
    const oldest = this.#windows.keys().next();
    if (oldest.done !== true) this.#windows.delete(oldest.value);
  }
}

/** A fixed window, useful when a single global budget is enough. */
export class SingleWindowRateLimiter implements RateLimit {
  readonly #window: RateWindow;

  constructor(limit: number, windowMs: number) {
    this.#window = new RateWindow(limit, windowMs);
  }

  allow(_key: string, now: number): boolean {
    return this.#window.take(now);
  }

  retryAfterSeconds(_key: string, now: number): number {
    return this.#window.retryAfterSeconds(now);
  }
}