/**
 * Creating a room is one round trip to an endpoint that draws random bytes, so there is
 * no time to win and the only lever is how the wait reads: an answer landing inside a
 * frame is indistinguishable from the click having been dropped. A floor costs the slow
 * case nothing, because the slow case has already paid it.
 */
export const MINIMUM_PENDING_MS = 300;

export function pendingAtLeast(
  startedAt: number,
  minimumMs: number = MINIMUM_PENDING_MS,
  now: () => number = Date.now,
): Promise<void> {
  const remaining = minimumMs - (now() - startedAt);

  if (remaining <= 0) return Promise.resolve();

  return new Promise((resolve) => {
    setTimeout(resolve, remaining);
  });
}
