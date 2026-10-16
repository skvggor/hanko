import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "@domain/chat";
import type { CatState } from "@domain/cat";
import type { PublicParticipant } from "@domain/protocol";
import type { Translator } from "@application/i18n";
import { Cat } from "@presentation/Cat";
import { CatComposer } from "@presentation/CatComposer";
import { ChatTranscript } from "@presentation/ChatTranscript";
import { useControlledCat } from "@presentation/useControlledCat";
import { useViewportSize } from "@presentation/useViewportSize";

export interface CatOverlayProps {
  myParticipantId: string | null;
  participants: PublicParticipant[];
  messages: ChatMessage[];
  connectedParticipantIds: ReadonlySet<string>;
  isOwner: boolean;
  onClear: () => void;
  onSend: (text: string) => void;
  translate: Translator;
  cats?: CatState[];
  onUpdateCat?: (update: Omit<CatState, "participantId" | "breed">) => void;
}

const CAT_SIZE_PX = 64;

const FIRST_LANE_TOP_REM = 4.5;
const LANE_STEP_REM = 5;

/**
 * The bottom of the last lane a cat may occupy. A room seats far more people than
 * fit on one screen, and the lane index is the render order, so without a ceiling
 * the twenty-sixth arrival is placed hundreds of rems down the page: invisible, and
 * impossible to click into control. Overflowing cats share a lane instead of
 * leaving the viewport, because a cat nobody can reach is worse than one sharing.
 */
const MAX_LANE_INDEX = 7;
export const MAX_VISIBLE_LANE_TOP_REM = FIRST_LANE_TOP_REM + MAX_LANE_INDEX * LANE_STEP_REM;

/**
 * Whether a keyboard or focus event belongs to something that is already using the
 * keys: a text field, or any control with its own activation. The cat only takes
 * keys that nothing else wants.
 */
function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  if (target.isContentEditable || target.closest("[contenteditable]") !== null) return true;

  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.getAttribute("role") === "textbox"
  );
}

export function CatOverlay({
  myParticipantId,
  participants,
  messages,
  connectedParticipantIds,
  isOwner,
  onClear,
  onSend,
  translate,
  cats = [],
  onUpdateCat,
}: Readonly<CatOverlayProps>) {
  const bounds = useViewportSize();
  const [isAsleep, setIsAsleep] = useState(false);
  const initialControlParticipantRef = useRef<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());

  /**
   * The cat is drawn in fluid rem, so its pixel size changes with the viewport.
   * Bounds and step are derived from the measured size instead of fixed pixels so
   * movement stays correct at any resolution.
   */
  const [catSize, setCatSize] = useState(CAT_SIZE_PX);
  const moveStep = Math.max(10, Math.round(catSize / 4));

  const {
    activity: localActivity,
    controlledDirection,
    controlledId,
    controlledPosition,
    hasMoved,
    moveControlled,
    releaseControl,
    requestControl,
    takeControl,
    triggerJump,
  } = useControlledCat({ asleep: isAsleep, bounds, catSize, cats });

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
      takeControl(
        myParticipantId,
        {
          x: ownCat.x * bounds.width,
          y: ownCat.y * bounds.height,
        },
        ownCat.direction,
      );
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
    takeControl,
  ]);


  useEffect(() => {
    if (
      controlledId === null ||
      controlledPosition === null ||
      onUpdateCat === undefined ||
      !hasMoved
    ) return;
    onUpdateCat({
      x: bounds.width === 0 ? 0 : controlledPosition.x / bounds.width,
      y: bounds.height === 0 ? 0 : controlledPosition.y / bounds.height,
      direction: controlledDirection,
      activity: localActivity,
      isPaused: false,
    });
  }, [
    bounds.height,
    bounds.width,
    controlledDirection,
    controlledId,
    controlledPosition,
    hasMoved,
    localActivity,
    onUpdateCat,
  ]);

  /**
   * Escape is the one key the cat claims wherever the focus happens to be, because
   * it is how you get out of a thing and nothing else on the page wants it.
   */
  useEffect(() => {
    if (controlledId === null) return undefined;

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") releaseControl();
    };

    globalThis.addEventListener("keydown", handleEscape);
    return () => globalThis.removeEventListener("keydown", handleEscape);
  }, [controlledId, releaseControl]);

  /**
   * Movement and the jump are claimed only while the cat itself holds the focus.
   * The arrow keys are also how the page scrolls and the space bar is also how a
   * button is pressed, so a handler that took them document-wide would take them
   * from the board and from every control in it. Taking them from the focused cat
   * keeps the native behaviour everywhere else, which is what a keyboard user is
   * entitled to expect from a widget that has taken focus.
   */
  useEffect(() => {
    const button = overlayRef.current?.querySelector<HTMLElement>(
      `[data-testid="cat-${controlledId}"] .cat__button`,
    );
    if (button === null || button === undefined) return undefined;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isTextTarget(event.target)) return;
      if (event.defaultPrevented) return;

      switch (event.key) {
        case " ":
          event.preventDefault();
          triggerJump();
          break;
        case "ArrowUp":
          event.preventDefault();
          moveControlled(0, -moveStep);
          break;
        case "ArrowDown":
          event.preventDefault();
          moveControlled(0, moveStep);
          break;
        case "ArrowLeft":
          event.preventDefault();
          moveControlled(-moveStep, 0);
          break;
        case "ArrowRight":
          event.preventDefault();
          moveControlled(moveStep, 0);
          break;
        default:
          break;
      }
    };

    button.addEventListener("keydown", handleKeyDown);
    return () => button.removeEventListener("keydown", handleKeyDown);
  }, [controlledId, moveControlled, moveStep, triggerJump]);

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
      if (isTextTarget(event.target) && !asleep) {
        const position = controlledPosition;
        if (position !== null) takeControl(ownId, position, controlledDirection);
      }
    };

    globalThis.addEventListener("focusin", onFocusIn);
    globalThis.addEventListener("focusout", onFocusOut);
    return () => {
      globalThis.removeEventListener("focusin", onFocusIn);
      globalThis.removeEventListener("focusout", onFocusOut);
    };
  }, [asleep, controlledDirection, controlledPosition, myParticipantId, releaseControl, takeControl]);

  /**
 * A hidden id is forgotten as soon as its owner drops out of the room. Keeping it
 * would mean that a person who hid a cat, and then watched that person come back,
 * was still looking at a gap with no way to undo it. Reconciling against who is
 * connected rather than who is listed is what makes the hiding temporary: a
 * participant stays seated while they are away, so only losing the connection
 * proves they actually left.
 *
 * Adjusted during the render rather than in an effect because the room it reads is
 * a prop: an effect would publish the pruned set one frame late, which is one frame
 * of a cat that was not meant to be on screen.
 */
const connectedIds = useMemo(
  () =>
    new Set(
      participants
        .filter((participant) => participant.isConnected)
        .map((participant) => participant.id),
    ),
  [participants],
);

const [reconciledIds, setReconciledIds] = useState(participants);

if (reconciledIds !== participants) {
  setReconciledIds(participants);
  const kept = new Set([...hiddenIds].filter((id) => connectedIds.has(id)));
  if (kept.size !== hiddenIds.size) setHiddenIds(kept);
}

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
          catState={catByParticipant.get(participant.id)}
          controlledActivity={localActivity}
          controlledDirection={controlledDirection}
          controlledPosition={participant.id === myParticipantId ? controlledPosition : null}
          isControllable={participant.id === myParticipantId}
          isControlled={controlledId === participant.id}
          key={participant.id}
          laneIndex={index % (MAX_LANE_INDEX + 1)}
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

      <ChatTranscript
        connectedParticipantIds={connectedParticipantIds}
        messages={messages}
        myParticipantId={myParticipantId}
        translate={translate}
      />

      <CatComposer
        hasMessages={messages.length > 0}
        isOwner={isOwner}
        onClear={onClear}
        onSend={onSend}
        translate={translate}
      />

    </div>
  );
}
