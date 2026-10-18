import type { Translator } from "@application/i18n";
import { BUILD_YEAR } from "@config/version";
import { BuildStamp } from "@presentation/BuildStamp";
import { Logo } from "@presentation/Logo";

/**
 * One type recipe for the lockup, sized in em against itself: only the lockup's own size
 * changes between the chrome and the home screen, so the brand reads as one thing in both.
 */
const NAME_TYPE = "font-display m-0 text-[1em] leading-none font-bold tracking-[-0.02em] text-ink";
const TAGLINE_TYPE = "m-0 text-[0.45em] font-medium tracking-[0.04em] text-ink-dim";

export interface BrandMarkProps {
  translate: Translator;
  /** Header is the chrome. Hero is the home screen, where the lockup is the content. */
  size?: "header" | "hero";
  buildCommit?: string;
  onNavigateHome?: () => void;
}

export function BrandMark({
  translate,
  size = "header",
  buildCommit = "",
  onNavigateHome,
}: Readonly<BrandMarkProps>) {
  const name = <h1 className={NAME_TYPE}>{translate("brand.name")}</h1>;
  const tagline = <p className={TAGLINE_TYPE}>{translate("brand.tagline")}</p>;

  if (size === "hero") {
    return (
      <div className="flex flex-col items-center gap-snug text-center text-[2.5rem]">
        <Logo className="h-28 w-28 text-primary-bright" />
        <div className="flex items-center gap-tight">
          {name}
          <BuildStamp commit={buildCommit} translate={translate} />
        </div>
        {tagline}
      </div>
    );
  }

  if (buildCommit !== "") {
    return (
      <div className="grid w-max grid-cols-[var(--spacing-stack)_auto_auto] grid-rows-[auto_auto] items-center gap-x-snug text-[1.375rem]">
        <button
          aria-label={translate("brand.goHome")}
          className="col-span-2 row-start-1 flex cursor-pointer items-center gap-snug text-left"
          data-logo
          onClick={onNavigateHome}
          type="button"
        >
          <Logo className="h-8 w-8 shrink-0 text-primary-bright" />
          {name}
        </button>
        <span className="col-start-3 row-start-1 flex items-center">
          <BuildStamp commit={buildCommit} translate={translate} />
        </span>
        <p className={`${TAGLINE_TYPE} col-start-2 col-span-2 row-start-2 text-left`}>
          {translate("brand.tagline")}
        </p>
      </div>
    );
  }

  return (
    <button
      aria-label={translate("brand.goHome")}
      className="flex cursor-pointer items-center gap-snug text-[1.375rem]"
      data-logo
      onClick={onNavigateHome}
      type="button"
    >
      <Logo className="h-8 w-8 shrink-0 text-primary-bright" />
      {/* On a phone the mark keeps the brand and the wording steps aside, because the
          one thing worth the width is which room this is. */}
      <span className="hidden flex-col items-start sm:flex">
        {name}
        {tagline}
      </span>
    </button>
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

export function Signature({ translate, glass = false }: Readonly<SignatureProps>) {
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
