import { useCallback, useRef, useState } from "react";
import type { ChatMessage } from "@domain/chat";
import { breedForParticipantId, type CatActivity, type CatBreed, type CatState } from "@domain/cat";
import type { Translator } from "@application/i18n";
import { CatControls } from "@presentation/CatControls";
import { CatSprite } from "@presentation/CatSprite";
import { SpeechBubble } from "@presentation/SpeechBubble";
import { useCat } from "@presentation/useCat";

export interface CatProps {
  participantId: string;
  name: string;
  isControllable: boolean;
  isControlled: boolean;
  controlledPosition: { x: number; y: number } | null;
  messages: ChatMessage[];
  laneIndex: number;
  onRequestControl: (position: { x: number; y: number }) => void;
  onReleaseControl: () => void;
  onRemove: () => void;
  translate: Translator;
  /**
 * Absent until the room publishes this cat, which is why the prop admits an
 * explicit undefined: a participant can be connected before their cat is known, and
 * the cat stands in its lane until it is.
 */
catState?: CatState | undefined;
  controlledDirection?: "left" | "right";
  controlledActivity?: CatActivity;
  onPauseChange?: (paused: boolean) => void;
}

const LANE_STEP_REM = 5;
const FIRST_LANE_TOP_REM = 4.5;

export function Cat({
  participantId,
  name,
  isControllable,
  isControlled,
  controlledPosition,
  messages,
  laneIndex,
  onRequestControl,
  onReleaseControl,
  onRemove,
  translate,
  catState,
  controlledDirection = "right",
  controlledActivity,
  onPauseChange,
}: Readonly<CatProps>) {
  const breed: CatBreed = catState?.breed ?? breedForParticipantId(participantId);
  const { activity, isPaused, durationSeconds, togglePause } = useCat({
    isControllable,
    participantId,
  });
  const catRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  /** The arrow keys answer to the focus and nothing else, so this is when the keyboard is actually driving. */
  const isDriving = isControlled && isFocused;

  // The controlled cat's state is local, since the server skips echoing it back;
  // remote cats read the position and pose the server last published for them.
  // A local pause toggle has to win over the server copy, or clicking pause would
  // flip the hook while the render stayed anchored to the stale remote value.
  const paused = isControllable ? isPaused : (catState?.isPaused ?? false);
  const baseActivity: CatActivity = isControlled
    ? (controlledActivity ?? "idle")
    : (catState?.activity ?? activity);
  // Pausing a cat is how it is put to bed, so the sleeping pose replaces whatever
  // it was doing and it drifts off with the animated Zs.
  const effectiveActivity: CatActivity = paused ? "sleeping" : baseActivity;
  const effectiveDirection: "left" | "right" = isControlled
    ? controlledDirection
    : (catState?.direction ?? "right");

  const lastOwnMessage = messages.reduce<ChatMessage | undefined>(
    (found, message) => (message.authorId === participantId ? message : found),
    undefined,
  );

  const readPosition = useCallback((): { x: number; y: number } => {
    if (isControlled && controlledPosition !== null) return controlledPosition;

    const rect = catRef.current?.getBoundingClientRect();
    return { x: rect?.left ?? 0, y: rect?.top ?? 0 };
  }, [controlledPosition, isControlled]);

  /**
   * Clicking a controlled cat does nothing: releasing here is what sent the cat
   * snapping back to its lane. A released cat is re-grabbed in place instead, so a
   * click never moves it.
   */
  const handleClick = useCallback(() => {
    if (!isControllable || isControlled) return;

    onRequestControl(readPosition());
  }, [isControllable, isControlled, onRequestControl, readPosition]);

  const handlePause = useCallback(() => {
    const next = !paused;
    togglePause();
    onPauseChange?.(next);
    // Pausing hands the keyboard back; resuming wakes the cat and re-grabs it so
    // it is live again without having to click it first.
    if (next) {
      onReleaseControl();
    } else {
      onRequestControl(readPosition());
    }
  }, [paused, togglePause, onPauseChange, onReleaseControl, onRequestControl, readPosition]);

  const handleRemove = useCallback(() => {
    onRemove();
    onReleaseControl();
  }, [onRemove, onReleaseControl]);

  function controlLabel(): string {
    if (isControlled) return translate("cat.release");
    if (paused) return translate("cat.resume", { name });
    return translate("cat.pause", { name });
  }

  function statusLabel(): string {
    if (isControlled) return translate("cat.status.controlled");
    if (paused) return translate("cat.statusPaused");
    return translate(`cat.status.${effectiveActivity}`);
  }

  const laneTop = `${FIRST_LANE_TOP_REM + laneIndex * LANE_STEP_REM}rem`;
  const status = statusLabel();

  let style: React.CSSProperties;
  if (controlledPosition !== null) {
    style = {
      top: 0,
      left: 0,
      transform: `translate(${controlledPosition.x}px, ${controlledPosition.y}px)`,
      // Gliding between key presses keeps the stride in step with the legs
      // instead of teleporting the body while the paws are mid-swing.
      transition: "transform 260ms ease-out",
      "--cat-duration": undefined,
    };
  } else if (catState === undefined) {
    style = {
      top: laneTop,
      "--cat-duration": `${durationSeconds}s`,
    };
  } else {
    style = {
      left: `${catState.x * 100}%`,
      top: `${catState.y * 100}%`,
      "--cat-duration": undefined,
    };
  }

  return (
    <div
      ref={catRef}
      className="cat"
      data-activity={effectiveActivity}
      data-controllable={isControllable}
      data-controlled={isControlled}
      data-driving={isDriving}
      data-paused={paused}
      data-synced={catState !== undefined}
      data-testid={`cat-${participantId}`}
      style={style}
    >
      {/* Names the cat rather than the state: steering is looking for your own, not for a word. */}
      {isDriving && (
        <span aria-hidden="true" className="cat__badge cat__badge--controlled">
          {name}
        </span>
      )}

      {isControllable && paused && !isControlled && (
        <span aria-hidden="true" className="cat__badge">
          {translate("cat.paused")}
        </span>
      )}

      <button
        aria-label={`${name} — ${controlLabel()}`}
        aria-pressed={isControlled}
        className="cat__button"
        type="button"
        onBlur={() => setIsFocused(false)}
        onClick={handleClick}
        onFocus={() => setIsFocused(true)}
      >
        <CatSprite
          activity={effectiveActivity}
          breed={breed}
          direction={effectiveDirection}
        />
        {effectiveActivity === "sleeping" && (
          <span aria-hidden="true" className="cat__sleep-z">
            <span className="cat__sleep-z__letter">Z</span>
            <span className="cat__sleep-z__letter">z</span>
            <span className="cat__sleep-z__letter">z</span>
          </span>
        )}
        <span className="visually-hidden">
          {name}: {status}
        </span>
      </button>

      <CatControls
        isOwn={isControllable}
        isPaused={paused}
        name={name}
        onRemove={handleRemove}
        onTogglePause={handlePause}
        translate={translate}
      />

      {lastOwnMessage !== undefined && (
        <SpeechBubble
          authorName={lastOwnMessage.authorName}
          key={lastOwnMessage.id}
          text={lastOwnMessage.text}
        />
      )}
    </div>
  );
}
