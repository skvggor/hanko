import { useEffect, useState } from "react";
import type { Translator } from "@application/i18n";

const STAMP_DURATION_MS = 460;

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
        className={`relative z-1 flex h-18 w-18 items-center justify-center rounded-full border-[0.1875rem] font-display text-[2.125rem] font-bold ${
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
  return (
    <InkStamp
      label={
        myVote === null
          ? translate("vote.prompt")
          : translate("vote.stamp", { value: myVote })
      }
      pressId={pressId}
      value={myVote}
    />
  );
}