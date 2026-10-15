import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "@domain/chat";
import type { CatActivity, CatState } from "@domain/cat";
import type { PublicParticipant } from "@domain/protocol";
import type { Translator } from "@application/i18n";
import { Cat } from "@presentation/Cat";
import { CatComposer } from "@presentation/CatComposer";
import { useViewportSize } from "@presentation/useViewportSize";

export interface CatOverlayProps {
  myParticipantId: string | null;
  participants: PublicParticipant[];
  messages: ChatMessage[];
  isOwner: boolean;
  onClear: () => void;
  onSend: (text: string) => void;
  translate: Translator;
  cats?: CatState[];
  onUpdateCat?: (update: Omit<CatState, "participantId" | "breed">) => void;
}

const CAT_SIZE_PX = 64;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Whether a keyboard or focus event belongs to a text field. While it does, the
 * cat must not claim the keys, or space would jump instead of typing a space.
 */
function isTextTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable)
  );
}

export function CatOverlay({
  myParticipantId,
  participants,
  messages,
  isOwner,
  onClear,
  onSend,
  translate,
  cats = [],
  onUpdateCat,
}: Readonly<CatOverlayProps>) {
  const bounds = useViewportSize();
  const [controlledId, setControlledId] = useState<string | null>(null);
  const [controlledPosition, setControlledPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isAngry, setIsAngry] = useState(false);
  const [controlledDirection, setControlledDirection] = useState<"left" | "right">("right");
  const [movingPhase, setMovingPhase] = useState<"idle" | "walking">("idle");
  const [isJumping, setIsJumping] = useState(false);
  const [isAsleep, setIsAsleep] = useState(false);
  const initialControlParticipantRef = useRef<string | null>(null);
  const controlledMovementRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const movingTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const jumpTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());

  /**
   * The cat is drawn in fluid rem, so its pixel size changes with the viewport.
   * Bounds and step are derived from the measured size instead of fixed pixels so
   * movement stays correct at any resolution.
   */
  const [catSize, setCatSize] = useState(CAT_SIZE_PX);
  const moveStep = Math.max(10, Math.round(catSize / 4));

  /**
   * The controlled cat's pose is driven locally: it walks only in the moments after
   * a move, then settles to idle so the legs stop and it just breathes.
   */
  function localActivityValue(): CatActivity {
    if (isJumping) return "jumping";
    if (isAngry) return "angry";
    return movingPhase;
  }

  const localActivity: CatActivity = localActivityValue();

  const markMoving = useCallback(() => {
    setMovingPhase("walking");
    if (movingTimeoutRef.current !== null) globalThis.clearTimeout(movingTimeoutRef.current);
    movingTimeoutRef.current = globalThis.setTimeout(() => setMovingPhase("idle"), 560);
  }, []);

  const triggerJump = useCallback(() => {
    setIsJumping(true);
    controlledMovementRef.current = true;
    if (jumpTimeoutRef.current !== null) globalThis.clearTimeout(jumpTimeoutRef.current);
    jumpTimeoutRef.current = globalThis.setTimeout(() => setIsJumping(false), 450);
  }, []);

  useEffect(
    () => () => {
      if (movingTimeoutRef.current !== null) globalThis.clearTimeout(movingTimeoutRef.current);
      if (jumpTimeoutRef.current !== null) globalThis.clearTimeout(jumpTimeoutRef.current);
    },
    [],
  );

  const visibleParticipants = useMemo(
    () => participants.filter((participant) => participant.isConnected && !hiddenIds.has(participant.id)),
    [participants, hiddenIds],
  );

  const catByParticipant = useMemo(
    () => new Map(cats.map((cat) => [cat.participantId, cat])),
    [cats],
  );

  // A sleeping cat is never controllable: it answers the keyboard only while awake.
  // The local flag is the truth for our own cat (the server never echoes our own
  // pause back), seeded once from the server so a reconnect while asleep still holds.
  const ownCatState = myParticipantId === null ? undefined : catByParticipant.get(myParticipantId);
  const sleepInitRef = useRef(false);
  const asleep = isAsleep;

  useEffect(() => {
    if (sleepInitRef.current || ownCatState === undefined) return undefined;
    sleepInitRef.current = true;
    const shouldBeAsleep =
      ownCatState.isPaused === true || ownCatState.activity === "sleeping";
    if (!shouldBeAsleep) return undefined;

    const timer = window.setTimeout(() => setIsAsleep(true));
    return () => window.clearTimeout(timer);
  }, [ownCatState]);

  useEffect(() => {
    const element = overlayRef.current?.querySelector<HTMLElement>(".cat");
    const width = element?.getBoundingClientRect().width ?? 0;
    if (width > 0) setCatSize(width);
  }, [bounds, visibleParticipants.length]);

  useEffect(() => {
    if (
      myParticipantId === null ||
      controlledId !== null ||
      asleep ||
      ownCatState?.isPaused === true ||
      ownCatState?.activity === "sleeping" ||
      initialControlParticipantRef.current === myParticipantId ||
      !catByParticipant.has(myParticipantId)
    ) {
      return;
    }

    const ownCat = catByParticipant.get(myParticipantId);
    if (ownCat === undefined) return;

    initialControlParticipantRef.current = myParticipantId;
    const controlTimer = window.setTimeout(() => {
      setControlledId(myParticipantId);
      setControlledPosition({
        x: ownCat.x * bounds.width,
        y: ownCat.y * bounds.height,
      });
      setControlledDirection(ownCat.direction);
      controlledMovementRef.current = false;
    });

    return () => window.clearTimeout(controlTimer);
  }, [
    asleep,
    bounds.height,
    bounds.width,
    catByParticipant,
    controlledId,
    myParticipantId,
    ownCatState?.activity,
    ownCatState?.isPaused,
  ]);

  const liveText = useMemo(
    () => messages.map((message) => `${message.authorName}: ${message.text}`).join(". "),
    [messages],
  );

  const requestControl = useCallback(
    (participantId: string, position: { x: number; y: number }) => {
      setControlledId(participantId);
    setControlledPosition(position);
    setIsAngry(false);
    setControlledDirection("right");
    controlledMovementRef.current = false;
    },
    [],
  );

  const releaseControl = useCallback(() => {
    setControlledId(null);
    setIsAngry(false);
    setMovingPhase("idle");
    controlledMovementRef.current = false;
  }, []);

  const moveControlled = useCallback(
    (deltaX: number, deltaY: number) => {
      if (asleep) return;
      controlledMovementRef.current = true;
      markMoving();
      if (deltaX !== 0) setControlledDirection(deltaX < 0 ? "left" : "right");
      setControlledPosition((previous) => {
        if (previous === null) return previous;

        const next = {
          x: clamp(previous.x + deltaX, 0, Math.max(0, bounds.width - catSize)),
          y: clamp(previous.y + deltaY, 0, Math.max(0, bounds.height - catSize)),
        };
        const normalizedX = bounds.width === 0 ? 0 : next.x / bounds.width;
        const normalizedY = bounds.height === 0 ? 0 : next.y / bounds.height;
        const collision = cats.some((cat) =>
          cat.participantId !== controlledId &&
          Math.abs(cat.x - normalizedX) < 0.08 &&
          Math.abs(cat.y - normalizedY) < 0.08,
        );
        if (collision) setIsAngry(true);
        return next;
      });
    },
    [asleep, bounds.width, bounds.height, catSize, cats, controlledId, markMoving],
  );

  /**
   * Being bumped is a reaction, not a control lock: the angry face fades after a
   * moment and the cat keeps obeying the keyboard. Freezing here is what made one
   * downward move look like the movement had hit a limit.
   */
  useEffect(() => {
    if (!isAngry) return undefined;

    const id = window.setTimeout(() => setIsAngry(false), 1_200);
    return () => window.clearTimeout(id);
  }, [isAngry]);

  useEffect(() => {
    if (
      controlledId === null ||
      controlledPosition === null ||
      onUpdateCat === undefined ||
      !controlledMovementRef.current
    ) return;
    onUpdateCat({
      x: bounds.width === 0 ? 0 : controlledPosition.x / bounds.width,
      y: bounds.height === 0 ? 0 : controlledPosition.y / bounds.height,
      direction: controlledDirection,
      activity: localActivity,
      isPaused: false,
    });
  }, [bounds.height, bounds.width, controlledDirection, controlledId, controlledPosition, localActivity, onUpdateCat]);

  useEffect(() => {
    if (controlledId === null) return undefined;

    const handleKeyDown = (event: KeyboardEvent): void => {
      // While typing, the keys belong to the text field, never to the cat.
      if (isTextTarget(event.target)) return;

      if (event.key === "Escape") {
        releaseControl();
        return;
      }

      if (event.key === " ") {
        event.preventDefault();
        triggerJump();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveControlled(0, -moveStep);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        moveControlled(0, moveStep);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveControlled(-moveStep, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        moveControlled(moveStep, 0);
      }
    };

    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [controlledId, moveControlled, moveStep, releaseControl, triggerJump]);

  /**
   * Reaching for the composer hands the keyboard back to the text field: the cat
   * drops its selection so space and arrows type instead of moving it, and it is
   * re-grabbed in place when the field is left.
   */
  useEffect(() => {
    const ownId = myParticipantId;
    if (ownId === null) return undefined;

    const onFocusIn = (event: FocusEvent): void => {
      if (isTextTarget(event.target)) releaseControl();
    };
    const onFocusOut = (event: FocusEvent): void => {
      if (isTextTarget(event.target) && !asleep) setControlledId(ownId);
    };

    globalThis.addEventListener("focusin", onFocusIn);
    globalThis.addEventListener("focusout", onFocusOut);
    return () => {
      globalThis.removeEventListener("focusin", onFocusIn);
      globalThis.removeEventListener("focusout", onFocusOut);
    };
  }, [asleep, myParticipantId, releaseControl]);

  const removeCat = useCallback((participantId: string) => {
    setHiddenIds((previous) => {
      const next = new Set(previous);
      next.add(participantId);
      return next;
    });
  }, []);

  /**
   * Pausing is a pose, so it travels to the other clients like a move: the cat
   * falls asleep (or wakes) everywhere, not just on the screen that clicked it.
   */
  const handlePauseChange = useCallback(
    (paused: boolean) => {
      setIsAsleep(paused);
      onUpdateCat?.({
        x: bounds.width === 0 || controlledPosition === null ? 0 : controlledPosition.x / bounds.width,
        y: bounds.height === 0 || controlledPosition === null ? 0 : controlledPosition.y / bounds.height,
        direction: controlledDirection,
        activity: paused ? "sleeping" : "idle",
        isPaused: paused,
      });
    },
    [bounds.height, bounds.width, controlledDirection, controlledPosition, onUpdateCat],
  );

  return (
    <div ref={overlayRef} aria-hidden="false" className="cat-overlay">
      {visibleParticipants.map((participant, index) => (
        <Cat
          catState={catByParticipant.get(participant.id) as CatState}
          controlledActivity={localActivity}
          controlledDirection={controlledDirection}
          controlledPosition={participant.id === myParticipantId ? controlledPosition : null}
          isControllable={participant.id === myParticipantId}
          isControlled={controlledId === participant.id}
          key={participant.id}
          laneIndex={index}
          messages={messages}
          name={participant.name}
          onPauseChange={handlePauseChange}
          onReleaseControl={releaseControl}
          onRemove={() => removeCat(participant.id)}
          onRequestControl={(position) => requestControl(participant.id, position)}
          participantId={participant.id}
          translate={translate}
        />
      ))}

      <CatComposer
        hasMessages={messages.length > 0}
        isOwner={isOwner}
        onClear={onClear}
        onSend={onSend}
        translate={translate}
      />

      <div aria-live="polite" className="visually-hidden" role="log">
        {liveText}
      </div>
    </div>
  );
}
