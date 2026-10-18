import { useEffect, useRef, useState } from "react";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import type { Translator } from "@application/i18n";

const COMMIT_SHA_PATTERN = /^[\da-f]{7,64}$/i;
const MATRIX_CHARACTERS = "0123456789abcdef";

function scrambleCommit(commit: string, frame: number): string {
  return Array.from(commit, (character, index) => {
    const seed = (character.codePointAt(0) ?? 0) + index * 7 + frame * 11;
    return MATRIX_CHARACTERS[seed % MATRIX_CHARACTERS.length] ?? character;
  }).join("");
}

function prefersReducedMotion(element: HTMLElement | null): boolean {
  if (element !== null && element.closest('[data-reduced-motion="true"]') !== null) {
    return true;
  }

  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export interface BuildStampProps {
  commit: string;
  translate: Translator;
}

export function BuildStamp({ commit, translate }: Readonly<BuildStampProps>) {
  const isValidCommit = COMMIT_SHA_PATTERN.test(commit);
  const shortCommit = isValidCommit ? commit.slice(0, 7).toLowerCase() : "";
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [counterFrame, setCounterFrame] = useState<number | null>(null);
  const isActive = isHovered || isFocused;

  useEffect(() => {
    if (!isValidCommit || !isActive || prefersReducedMotion(linkRef.current)) return undefined;

    let frame = 0;
    const interval = globalThis.setInterval(() => {
      frame += 1;
      if (frame >= 8) {
        globalThis.clearInterval(interval);
        setCounterFrame(null);
        return;
      }

      setCounterFrame(frame);
    }, 36);

    return () => globalThis.clearInterval(interval);
  }, [isActive, isValidCommit, shortCommit]);

  function stopCounterIfInactive(isStillActive: boolean): void {
    if (!isStillActive) setCounterFrame(null);
  }

  if (!isValidCommit) return null;
  const displayedCommit =
    counterFrame === null ? shortCommit : scrambleCommit(shortCommit, counterFrame);

  return (
    <a
      aria-label={translate("brand.buildCommitLink", { commit: shortCommit })}
      className="build-stamp inline-flex min-h-6 shrink-0 items-center gap-hair rounded-chip border border-line bg-paper-raised px-tight py-hair font-mono text-[0.5rem] font-bold tracking-[0.06em] text-ink-dim hover:border-line-strong hover:bg-paper-sunk hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      href={`https://github.com/skvggor/hanko/commit/${commit}`}
      rel="noopener noreferrer"
      ref={linkRef}
      target="_blank"
      onBlur={() => {
        setIsFocused(false);
        stopCounterIfInactive(isHovered);
      }}
      onFocus={() => setIsFocused(true)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        stopCounterIfInactive(isFocused);
      }}
    >
      <span aria-hidden="true" className="build-stamp__digits leading-none">
        {displayedCommit}
      </span>
      <ArrowSquareOutIcon
        aria-hidden="true"
        className="build-stamp__icon block shrink-0"
        size={10}
        weight="bold"
      />
    </a>
  );
}
