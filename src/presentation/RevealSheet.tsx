import { useEffect, useState, type CSSProperties } from "react";
import type { RevealedVote } from "@domain/protocol";
import { tallyReveals, type Consensus } from "@domain/tally";
import type { Translator } from "@application/i18n";

const STAGGER_MS = 90;

const CONSENSUS_TONE: Record<Consensus, { bar: string; text: string }> = {
  aligned: { bar: "bg-secondary", text: "text-secondary" },
  close: { bar: "bg-accent", text: "text-ink" },
  split: { bar: "bg-primary", text: "text-primary" },
};

export interface RevealSheetProps {
  entries: RevealedVote[];
  scale: readonly string[];
  translate: Translator;
}

function voteLabel(value: string, translate: Translator): string {
  return value === "coffee" ? translate("vote.coffee") : value;
}

export function tiltFor(index: number, total: number): number {
  if (total <= 1) return -2;

  const step = 6 / (total - 1);
  return -3 + step * index;
}

function revealStyle(tiltDegrees: number): CSSProperties {
  return { "--reveal-tilt": `${tiltDegrees}deg` } as CSSProperties;
}

/**
 * The reveal reads top down as an argument: the verdict first, then the shape of the
 * answers, then who said what. The average leads because it is the number the room
 * argued towards; the range sits under it as context, not as a competing headline.
 */
export function RevealSheet({ entries, scale, translate }: RevealSheetProps) {
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    if (entries.length === 0) return;

    const timeouts = entries.map((_, index) =>
      setTimeout(() => setRevealedCount(index + 1), index * STAGGER_MS),
    );

    return () => {
      for (const timeout of timeouts) clearTimeout(timeout);
    };
  }, [entries]);

  const tally = tallyReveals(entries, scale);
  const isComplete = revealedCount >= entries.length && entries.length > 0;
  const tone = CONSENSUS_TONE[tally.consensus];
  const headroom = Math.max(1, tally.counted);

  return (
    <div className="flex flex-col gap-4" data-complete={isComplete}>
      {isComplete && (
        <div className="rise-in flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="flex items-end gap-2.5">
            <span className="font-display text-[3.25rem] leading-[0.85] font-bold text-primary">
              {tally.average === null ? "–" : tally.average}
            </span>
            <span className="pb-1 text-[0.6875rem] font-semibold tracking-[0.16em] text-ink-dim uppercase">
              {translate("result.average")}
            </span>
          </div>

          <div className="flex flex-col items-end gap-1">
            {tally.min !== null && tally.max !== null && (
              <span className="font-mono text-[0.75rem] text-ink-dim">
                {translate("result.range", {
                  min: tally.min,
                  max: tally.max,
                })}
              </span>
            )}
            <span
              className={`rounded-chip px-2.5 py-1 text-[0.6875rem] font-bold tracking-[0.06em] uppercase ${
                tally.consensus === "aligned"
                  ? "bg-secondary/12 text-secondary"
                  : tally.consensus === "close"
                    ? "bg-accent/40 text-ink"
                    : "bg-primary/12 text-primary"
              }`}
              data-consensus={tally.consensus}
            >
              {translate(`consensus.${tally.consensus}`)}
            </span>
          </div>
        </div>
      )}

      {tally.distribution.length > 0 && isComplete && (
        <div className="flex flex-col gap-1.5">
          <div
            aria-label={translate("a11y.distribution")}
            className="flex h-9 w-full gap-1 overflow-hidden rounded-2xl"
            role="img"
          >
            {tally.distribution.map((row) => (
              <div
                className={`flex min-w-6 items-center justify-center text-[0.75rem] font-bold ${
                  row.value === "?" || row.value === "coffee"
                    ? `${tone.bar} text-paper-raised`
                    : `${tone.bar} text-paper-raised`
                }`}
                key={row.value}
                style={{ flexGrow: row.count, flexBasis: 0 }}
              >
                {voteLabel(row.value, translate)}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-ink-dim">
            {tally.needsDiscussion > 0 && (
              <span>
                {translate("result.needsDiscussion", { count: tally.needsDiscussion })}
              </span>
            )}
            {tally.coffee > 0 && (
              <span>{translate("result.coffee", { count: tally.coffee })}</span>
            )}
            {tally.counted > 0 && (
              <span className="ml-auto font-mono">
                {translate("result.ofVotes", {
                  counted: tally.counted,
                  total: headroom,
                })}
              </span>
            )}
          </div>
        </div>
      )}

      <ol
        aria-label={translate("a11y.revealList")}
        className="m-0 flex list-none flex-wrap gap-2 p-0"
      >
        {entries.slice(0, revealedCount).map((entry, index) => {
          const isDiscussion = entry.vote === "?";
          const isCoffee = entry.vote === "coffee";
          const isIdle = entry.points === null && !isDiscussion && !isCoffee;

          return (
            <li
              className="seal-in flex min-w-16 flex-1 basis-16 flex-col items-center gap-0.5 rounded-2xl border border-line bg-paper-raised px-1.5 py-2"
              key={entry.participantId}
              style={revealStyle(tiltFor(index, entries.length))}
            >
              <span className="max-w-full overflow-hidden text-[0.625rem] font-semibold tracking-[0.03em] text-ink-dim uppercase [text-overflow:ellipsis] whitespace-nowrap">
                {entry.name}
              </span>
              <span
                className={`font-display text-[1.5rem] leading-none font-bold ${
                  isIdle ? "text-ink-faint" : "text-ink"
                }`}
              >
                {isIdle ? "–" : voteLabel(entry.vote ?? "", translate)}
              </span>
              {isCoffee && (
                <span className="text-[0.5625rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
                  {translate("vote.coffee")}
                </span>
              )}
              {entry.role === "spectator" && (
                <span className="text-[0.5625rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
                  {translate("room.spectatorBadge")}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function revealDuration(entryCount: number): number {
  if (entryCount === 0) return 0;
  return (entryCount - 1) * STAGGER_MS + 480;
}