import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MINIMUM_PENDING_MS,
  pendingAtLeast,
} from "@application/minimumPending";

describe("pendingAtLeast", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds an answer that came back faster than a person could read it", async () => {
    vi.useFakeTimers();
    const settled = vi.fn();

    void pendingAtLeast(1000, 300, () => 1000).then(settled);
    await vi.advanceTimersByTimeAsync(299);

    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(settled).toHaveBeenCalled();
  });

  it("returns at once when the wait already ran its course", async () => {
    await expect(pendingAtLeast(1000, 300, () => 1400)).resolves.toBeUndefined();
  });

  it("waits for the remainder of a wait that is already under way", async () => {
    vi.useFakeTimers();
    const settled = vi.fn();

    void pendingAtLeast(1000, 300, () => 1250).then(settled);
    await vi.advanceTimersByTimeAsync(49);

    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(settled).toHaveBeenCalled();
  });

  it("asks for long enough to outlast a flash", () => {
    expect(MINIMUM_PENDING_MS).toBeGreaterThanOrEqual(300);
  });
});
