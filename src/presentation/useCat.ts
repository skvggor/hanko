import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CAT_INACTIVITY_MS, stableHash, type CatActivity } from "@domain/cat";

/**
 * A pointer reports far more often than a cat needs to be told anything. The sleep
 * timer is measured in minutes, so noticing a movement once a second keeps a cat
 * awake for as long as the person is, while a hundred updates a second would
 * re-render every cat in the room and rebuild that timer just as often.
 */
const ACTIVITY_THROTTLE_MS = 1_000;

export interface UseCatOptions {
  participantId: string;
  isControllable: boolean;
  inactivityMs?: number;
  random?: () => number;
}

export interface UseCatResult {
  activity: CatActivity;
  isPaused: boolean;
  durationSeconds: number;
  togglePause: () => void;
}

export function useCat({
  participantId,
  isControllable,
  inactivityMs = CAT_INACTIVITY_MS,
  random = Math.random,
}: Readonly<UseCatOptions>): UseCatResult {
  const [activity, setActivity] = useState<CatActivity>("walking");
  const [isPaused, setIsPaused] = useState(false);
  const [lastActivity, setLastActivity] = useState(() => Date.now());
  const randomRef = useRef(random);
  const revertTimeoutRef = useRef(0);
  const lastActivityRef = useRef(lastActivity);

  useEffect(() => {
    randomRef.current = random;
  }, [random]);

  const durationSeconds = useMemo(() => {
    const base = 22;
    const variation = stableHash(participantId) % 9;
    return base + variation;
  }, [participantId]);

  const isWalking = activity === "walking";

  /**
   * Any interaction wakes every cat and pushes back the sleep timer, because the
   * person is still there even if they are not touching their own cat.
   */
  useEffect(() => {
    const wake = (): void => {
      const now = Date.now();

      // The pose answers every event, because a sleeping cat should open its eyes
      // the instant the person moves. The timestamp is what gets throttled, since
      // that is the only part of it a fast pointer can make expensive.
      setActivity((current) =>
        current === "sleeping" || current === "jumping" ? "walking" : current,
      );

      if (now - lastActivityRef.current < ACTIVITY_THROTTLE_MS) return;

      lastActivityRef.current = now;
      setLastActivity(now);
    };

    globalThis.addEventListener("mousemove", wake);
    globalThis.addEventListener("keydown", wake);
    globalThis.addEventListener("click", wake);

    return () => {
      globalThis.removeEventListener("mousemove", wake);
      globalThis.removeEventListener("keydown", wake);
      globalThis.removeEventListener("click", wake);
    };
  }, []);

  /**
   * After inactivity the cat sleeps. The timer is reset by the wake listener, and
   * cancelled while paused so pausing does not immediately put the cat to bed.
   */
  useEffect(() => {
    if (!isControllable || isPaused) return undefined;

    const id = window.setTimeout(() => setActivity("sleeping"), inactivityMs);
    return () => window.clearTimeout(id);
  }, [isControllable, isPaused, inactivityMs, lastActivity]);

  /**
   * Random jumps keep the cat from looking mechanical. They only happen while the
   * cat is walking, and the pending timeout is cleared as soon as it stops.
   */
  useEffect(() => {
    if (!isWalking || isPaused) return undefined;

    let jumpTimeout = 0;

    const endJump = (): void => {
      setActivity((current) => (current === "jumping" ? "walking" : current));
    };

    const jump = (): void => {
      setActivity("jumping");
      revertTimeoutRef.current = window.setTimeout(endJump, 400);
    };

    const schedule = (): void => {
      const delay = 2_000 + randomRef.current() * 4_000;
      jumpTimeout = window.setTimeout(() => {
        jump();
        schedule();
      }, delay);
    };

    schedule();

    return () => window.clearTimeout(jumpTimeout);
  }, [isWalking, isPaused]);

  useEffect(
    () => () => {
      window.clearTimeout(revertTimeoutRef.current);
    },
    [],
  );

  const togglePause = useCallback(() => {
    if (!isControllable) return;

    setIsPaused((current) => {
      const next = !current;
      setActivity(next ? "idle" : "walking");

      if (!next) setLastActivity(Date.now());

      return next;
    });
  }, [isControllable]);

  return { activity, isPaused, durationSeconds, togglePause };
}
