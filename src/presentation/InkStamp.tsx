import { useEffect, useRef, useState } from "react";
import type { Translator } from "@application/i18n";
import { morphSeal, type SealMorpher } from "@presentation/sealMotion";

export type { SealMorpher } from "@presentation/sealMotion";

/**
 * The waiting mark. A dash reads as an empty line to fill in, where a question mark would
 * read as a vote of "?" and a set of dots would read as a loading state.
 */
const PLACEHOLDER = "—";

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
  /** Value currently stamped, or null while the seal is still waiting. */
  value: string | null;
  label: string;
  /**
   * Changes to force a fresh press. Bump this when the same value is chosen again
   * after being undone, so the animation replays instead of appearing already dry.
   */
  pressId?: number;
  /** Injected so the markup can be tested without a timeline underneath it. */
  morph?: SealMorpher;
}

type Phase = "waiting" | "wet" | "drying" | "lifting";

function readPhase(value: string | null, shown: string | null, dried: boolean): Phase {
  if (value === null) return shown === null ? "waiting" : "lifting";
  return dried ? "drying" : "wet";
}

function readTone(value: string | null, shown: string | null, dried: boolean): string {
  if (shown === null) return "border-line-strong bg-transparent text-line-strong";
  if (value === null || !dried) return "border-primary bg-transparent text-primary";
  return "border-primary bg-primary text-on-primary";
}

function glyphElements(host: HTMLElement | null): HTMLElement[] {
  return [...(host?.children ?? [])].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
}

/**
 * The seal impression: a ring that waits as a faint outline, takes the value as ink that
 * presses in and bleeds outward, then settles hollow so a committed vote reads as
 * permanent rather than pending.
 *
 * The slot is never removed, because a slot that appears with the vote pushed the panel
 * and everything under it down by the height of the seal.
 */
export function InkStamp({
  value,
  label,
  pressId = 0,
  morph = morphSeal,
}: Readonly<InkStampProps>) {
  const sealRef = useRef<HTMLSpanElement | null>(null);
  const placeholderRef = useRef<HTMLSpanElement | null>(null);
  const bleedRef = useRef<HTMLSpanElement | null>(null);
  const glyphsRef = useRef<HTMLSpanElement | null>(null);
  const lastStamp = useRef("");

  /** Which stamp has come to rest, so a fresh press reads as wet again. */
  const [settled, setSettled] = useState<string | null>(null);
  /** What the seal is still showing, so an undo has something to lift away. */
  const [lifted, setLifted] = useState<string | null>(null);

  const shown = value ?? lifted;
  const stamp = value === null ? "" : `${pressId}:${value}`;

  useEffect(() => {
    if (lastStamp.current === stamp) return;
    lastStamp.current = stamp;

    if (value !== null) setLifted(value);

    const abandon = morph({
      bleed: bleedRef.current,
      glyphs: glyphElements(glyphsRef.current),
      motion: value === null ? "release" : "press",
      placeholder: placeholderRef.current,
      seal: sealRef.current,
      settle: () => {
        if (value === null) setLifted(null);
        setSettled(stamp);
      },
    });

    return () => {
      abandon?.();
    };
  }, [morph, stamp, value]);

  const phase = readPhase(value, shown, settled === stamp);

  return (
    <div
      className="relative mx-auto flex h-24 w-24 items-center justify-center"
      data-phase={phase}
    >
      <span
        aria-hidden="true"
        className="absolute h-24 w-24 rounded-full border-[0.1875rem] border-primary opacity-0"
        data-bleed
        ref={bleedRef}
      />

      <span
        aria-hidden="true"
        className={`relative z-1 flex h-18 w-18 items-center justify-center rounded-full border-[0.1875rem] px-1 font-display ${sealFontSize(shown ?? "")} font-bold ${readTone(value, shown, settled === stamp)}`}
        data-seal
        ref={sealRef}
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center text-[1.25rem] text-line-strong"
          data-placeholder
          ref={placeholderRef}
        >
          {PLACEHOLDER}
        </span>

        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center"
          data-glyphs
          ref={glyphsRef}
        >
          {shown === null
            ? null
            : [...shown].map((character, index) => (
                <span
                  aria-hidden="true"
                  className="inline-block"
                  data-glyph
                  key={`${index}:${character}`}
                >
                  {character}
                </span>
              ))}
        </span>
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
  morph?: SealMorpher;
}

export function HankoStamp({
  myVote,
  pressId,
  translate,
  morph = morphSeal,
}: Readonly<HankoStampProps>) {
  /**
   * The card and the seal have to say the same thing. Stamping the raw value would
   * leave the seal reading "coffee" on a card that reads "Café", which reads as two
   * different votes rather than one vote shown twice.
   */
  const stamped = myVote === "coffee" ? translate("vote.coffee") : myVote;

  return (
    <InkStamp
      label={
        myVote === null
          ? translate("vote.waiting")
          : translate("vote.stamp", { value: stamped ?? myVote })
      }
      morph={morph}
      pressId={pressId}
      value={stamped}
    />
  );
}