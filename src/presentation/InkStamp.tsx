import { useEffect, useState } from "react";
import type { Translator } from "@application/i18n";

const STAMP_DURATION_MS = 460;

/**
 * The seal is a fixed circle, and a circle only comfortably holds a handful of
 * characters. A number is what the metaphor is built for, so it gets the whole face;
 * a word has to step down until it fits inside the ring rather than bleeding through
 * it, because a stamp that overshoots its own edge no longer reads as a stamp.
 */
const SEAL_DISPLAY_SIZE = "text-[2.125rem]";

function sealFontSize(label: string): string {
  if (label.length <= 2) return SEAL_DISPLAY_SIZE;
  if (label.length <= 3) return "text-[1.5rem]";
  if (label.length <= 4) return "text-[1.125rem]";
  return "text-[0.875rem]";
}

export interface InkStampProps {
  /** Value currently stamped, or null when nothing is pressed. */
  value: string | null;
  label: string;
  /**
   * Changes to force a fresh press. Bump this when the same value is chosen again
   * after being undone, so the animation replays instead of appearing already dry.
   */
  pressId?: number;
}

/**
 * The seal impression: a disc with an ink ring bleeding outward, settling to a
 * hollow mark so a committed vote reads as permanent rather than pending.
 */
export function InkStamp({ value, label, pressId = 0 }: InkStampProps) {
  const [driedStamp, setDriedStamp] = useState<string | null>(null);
  const stamp = value === null ? null : `${pressId}:${value}`;

  useEffect(() => {
    if (stamp === null) return;

    const timeout = setTimeout(() => setDriedStamp(stamp), STAMP_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [stamp]);

  if (stamp === null || value === null) return null;

  const isWet = driedStamp !== stamp;

  return (
    <div
      className="relative mx-auto flex h-24 w-24 items-center justify-center"
      data-phase={isWet ? "wet" : "drying"}
    >
      <span
        aria-hidden="true"
        className={`stamp-bleed absolute h-24 w-24 rounded-full border-[0.1875rem] border-primary ${isWet ? "opacity-100" : "opacity-0"}`}
        key={`bleed-${stamp}`}
      />
      <span
        aria-hidden="true"
        className={`relative z-1 flex h-18 w-18 items-center justify-center rounded-full border-[0.1875rem] px-1 font-display ${sealFontSize(value)} font-bold ${
          isWet
            ? "stamp-press border-primary bg-primary text-on-primary"
            : "stamp-settle border-primary bg-transparent text-primary"
        }`}
        data-seal
        key={`seal-${stamp}`}
      >
        {value}
      </span>
      <span aria-label={label} className="visually-hidden" role="img">
        {label}
      </span>
    </div>
  );
}

export interface HankoStampProps {
  myVote: string | null;
  pressId: number;
  translate: Translator;
}

export function HankoStamp({ myVote, pressId, translate }: HankoStampProps) {
  /**
   * The card and the seal have to say the same thing. Stamping the raw value would
   * leave the seal reading "coffee" on a card that reads "Café", which reads as two
   * different votes rather than one vote shown twice.
   */
  const stamped =
    myVote === null ? null : myVote === "coffee" ? translate("vote.coffee") : myVote;

  return (
    <InkStamp
      label={
        myVote === null
          ? translate("vote.prompt")
          : translate("vote.stamp", { value: stamped ?? myVote })
      }
      pressId={pressId}
      value={stamped}
    />
  );
}