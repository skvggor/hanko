import { useCallback, useEffect, useRef, useState } from "react";
import type { CatActivity, CatState } from "@domain/cat";

export interface ControlledPosition {
  x: number;
  y: number;
}

export interface UseControlledCatOptions {
  /** The viewport the cat walks inside, so a move can be kept on screen. */
  bounds: { width: number; height: number };
  /** The cat's measured pixel size, which is what the edges have to leave room for. */
  catSize: number;
  /** Every cat in the room, so a controlled one can be bumped by another. */
  cats: CatState[];
  /** A sleeping cat ignores the keyboard. */
  asleep: boolean;
}

export interface UseControlledCatResult {
  controlledId: string | null;
  controlledPosition: ControlledPosition | null;
  controlledDirection: "left" | "right";
  /** The pose to draw, which the controlled cat drives itself. */
  activity: CatActivity;
  /**
   * Whether the person has actually driven the cat, as opposed to the cat simply
   * having been placed where it was. Only a driven cat is worth telling the room
   * about: publishing the position of a cat nobody has touched would drag it to
   * wherever it was last seen.
   */
  hasMoved: boolean;
  requestControl: (participantId: string, position: ControlledPosition) => void;
  /**
   * Takes hold of a cat that is already standing somewhere, keeping the way it was
   * facing. Reconnecting to your own cat, or reaching back for it after typing, has
   * to leave it looking the way the room left it rather than snapping it to a
   * default heading.
   */
  takeControl: (
    participantId: string,
    position: ControlledPosition,
    direction: "left" | "right",
  ) => void;
  releaseControl: () => void;
  moveControlled: (deltaX: number, deltaY: number) => void;
  triggerJump: () => void;
}

/** How long a controlled cat keeps walking after a move, so the legs settle. */
const STRIDE_MS = 560;
/** How long a jump lasts before the cat is back on all four paws. */
const JUMP_MS = 450;
/** How long a bumped cat wears the angry face before forgiving it. */
const ANGER_MS = 1_200;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Which cat is being driven, where it is and what pose it is in. None of that is
 * drawing, and none of it is about the room around the cats: it is one state machine
 * that a person drives with four arrow keys and a space bar, and it earns a file of
 * its own so the rules of walking are readable without the rendering in the way.
 */
export function useControlledCat({
  bounds,
  catSize,
  cats,
  asleep,
}: Readonly<UseControlledCatOptions>): UseControlledCatResult {
  const [controlledId, setControlledId] = useState<string | null>(null);
  const [controlledPosition, setControlledPosition] = useState<ControlledPosition | null>(null);
  const [controlledDirection, setControlledDirection] = useState<"left" | "right">("right");
  const [movingPhase, setMovingPhase] = useState<"idle" | "walking">("idle");
  const [isJumping, setIsJumping] = useState(false);
  const [isAngry, setIsAngry] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const strideTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const jumpTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (strideTimeoutRef.current !== null) globalThis.clearTimeout(strideTimeoutRef.current);
      if (jumpTimeoutRef.current !== null) globalThis.clearTimeout(jumpTimeoutRef.current);
    },
    [],
  );

  /**
 * A jump is the loudest thing a cat does and being bumped the next, so they are
 * read in that order: the pose that explains the sudden movement wins over the one
 * that explains why it stopped where it did.
 */
function poseFor(
  isJumping: boolean,
  isAngry: boolean,
  movingPhase: "idle" | "walking",
): CatActivity {
  if (isJumping) return "jumping";
  if (isAngry) return "angry";
  return movingPhase;
}

  const takeControl = useCallback(
    (
      participantId: string,
      position: ControlledPosition,
      direction: "left" | "right",
    ) => {
      setControlledId(participantId);
      setControlledPosition(position);
      setIsAngry(false);
      setHasMoved(false);
      setControlledDirection(direction);
    },
    [],
  );

  const requestControl = useCallback(
    (participantId: string, position: ControlledPosition) => {
      takeControl(participantId, position, "right");
    },
    [takeControl],
  );

  const releaseControl = useCallback(() => {
    setControlledId(null);
    setIsAngry(false);
    setHasMoved(false);
    setMovingPhase("idle");
  }, []);

  const triggerJump = useCallback(() => {
    setIsJumping(true);
    setHasMoved(true);
    if (jumpTimeoutRef.current !== null) globalThis.clearTimeout(jumpTimeoutRef.current);
    jumpTimeoutRef.current = globalThis.setTimeout(() => setIsJumping(false), JUMP_MS);
  }, []);

  const activity: CatActivity = poseFor(isJumping, isAngry, movingPhase);

  const moveControlled = useCallback(
    (deltaX: number, deltaY: number) => {
      if (asleep) return;

      setHasMoved(true);
      setMovingPhase("walking");
      if (strideTimeoutRef.current !== null) globalThis.clearTimeout(strideTimeoutRef.current);
      strideTimeoutRef.current = globalThis.setTimeout(
        () => setMovingPhase("idle"),
        STRIDE_MS,
      );

      if (deltaX !== 0) setControlledDirection(deltaX < 0 ? "left" : "right");

      setControlledPosition((previous) => {
        if (previous === null) return previous;

        const next = {
          x: clamp(previous.x + deltaX, 0, Math.max(0, bounds.width - catSize)),
          y: clamp(previous.y + deltaY, 0, Math.max(0, bounds.height - catSize)),
        };
        const normalizedX = bounds.width === 0 ? 0 : next.x / bounds.width;
        const normalizedY = bounds.height === 0 ? 0 : next.y / bounds.height;
        const bumped = cats.some(
          (cat) =>
            cat.participantId !== controlledId &&
            Math.abs(cat.x - normalizedX) < 0.08 &&
            Math.abs(cat.y - normalizedY) < 0.08,
        );
        if (bumped) setIsAngry(true);

        return next;
      });
    },
    [asleep, bounds.width, bounds.height, catSize, cats, controlledId],
  );

  /**
   * Being bumped is a reaction, not a control lock: the angry face fades after a
   * moment and the cat keeps obeying the keyboard. Freezing here is what made one
   * downward move look like the movement had hit a limit.
   */
  useEffect(() => {
    if (!isAngry) return undefined;

    const id = window.setTimeout(() => setIsAngry(false), ANGER_MS);
    return () => window.clearTimeout(id);
  }, [isAngry]);

  return {
    activity,
    controlledDirection,
    controlledId,
    controlledPosition,
    hasMoved,
    moveControlled,
    releaseControl,
    requestControl,
    takeControl,
    triggerJump,
  };
}