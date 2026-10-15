import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CAT_INACTIVITY_MS, type CatActivity } from "@domain/cat";

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

function hashCode(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + (value.codePointAt(index) ?? 0);
    hash = Math.trunc(hash);
  }

  return Math.abs(hash);
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

  useEffect(() => {
    randomRef.current = random;
  }, [random]);

  const durationSeconds = useMemo(() => {
    const base = 22;
    const variation = hashCode(participantId) % 9;
    return base + variation;
  }, [participantId]);

  const isWalking = activity === "walking";

  /**
   * Any interaction wakes every cat and pushes back the sleep timer, because the
   * person is still there even if they are not touching their own cat.
   */
  useEffect(() => {
    const wake = (): void => {
      setLastActivity(Date.now());
      setActivity((current) =>
        current === "sleeping" || current === "jumping" ? "walking" : current,
      );
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
