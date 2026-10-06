import type { Translator } from "@application/i18n";
import { BUILD_YEAR } from "@config/version";
import { Wordmark } from "@presentation/Wordmark";

export function BrandMark({ translate }: { translate: Translator }) {
  return (
    <div className="flex items-center gap-2.5">
      <Wordmark size={38} />
      <div className="flex flex-col items-start">
        <h1 className="font-display m-0 text-[26px] leading-none font-bold tracking-[-0.02em] text-ink">
          {translate("brand.name")}
        </h1>
        <p className="m-0 text-[11px] font-medium tracking-[0.04em] text-ink-dim">
          {translate("brand.tagline")}
        </p>
      </div>
    </div>
  );
}

export function Signature({ translate }: { translate: Translator }) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-[11px] tracking-[0.04em] text-ink-faint">
      <span className="font-mono">© {BUILD_YEAR}</span>
      <span>
        {translate("brand.credit")}{" "}
        <a
          className="rounded-chip font-semibold text-ink underline decoration-primary decoration-2 underline-offset-[3px] transition-colors hover:text-primary"
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