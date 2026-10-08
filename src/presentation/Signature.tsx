import type { Translator } from "@application/i18n";
import { BUILD_YEAR } from "@config/version";
import { Wordmark } from "@presentation/Wordmark";

export function BrandMark({ translate }: { translate: Translator }) {
  return (
    <div className="flex items-center gap-snug">
      <Wordmark size={28} />
      {/* On a phone the disc keeps the brand and the wording steps aside, because the
          one thing worth the width is which room this is. */}
      <div className="hidden flex-col items-start sm:flex">
        <h1 className="font-display m-0 text-[1.375rem] leading-none font-bold tracking-[-0.02em] text-ink">
          {translate("brand.name")}
        </h1>
        <p className="m-0 text-[0.625rem] font-medium tracking-[0.04em] text-ink-dim">
          {translate("brand.tagline")}
        </p>
      </div>
    </div>
  );
}

export interface SignatureProps {
  translate: Translator;
  /**
   * The footer is pinned to the bottom of the page, so once the content is taller than
   * the viewport there is always something behind it and the ink has to sit on a
   * frosted surface rather than on the paper showing through.
   */
  glass?: boolean;
}

export function Signature({ translate, glass = false }: SignatureProps) {
  return (
    <footer
      className="sticky bottom-0 z-20 flex h-[var(--chrome-height)] items-center justify-between gap-x-snug border-t border-line px-gutter text-[0.6875rem] tracking-[0.04em] text-ink-faint"
      data-glass={glass}
    >
      <span className="font-mono">© {BUILD_YEAR}</span>
      <span>
        {translate("brand.credit")}{" "}
        <a
          className="rounded-chip font-semibold text-ink underline decoration-primary decoration-2 underline-offset-[0.1875rem] transition-colors hover:text-primary"
          href="https://skvggor.dev"
          rel="noreferrer noopener"
          target="_blank"
        >
          {translate("brand.author")}
        </a>{" "}
        <span aria-label="love" className="whitespace-nowrap">
          with 💜
        </span>
      </span>
    </footer>
  );
}