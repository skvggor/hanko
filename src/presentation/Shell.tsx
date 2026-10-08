import { useEffect, useState, type ReactNode } from "react";
import type { Locale } from "@application/i18n";
import { BrandMark, Signature } from "@presentation/Signature";
import "@presentation/styles/theme.css";

export interface ShellProps {
  locale: Locale;
  sessionName?: string | null;
  hasFloatingDock?: boolean;
  onLocaleChange: (locale: Locale) => void;
  translate: (path: string, variables?: Record<string, string | number>) => string;
  errorCode: string | null;
  children: ReactNode;
}

export function Shell({
  locale,
  sessionName = null,
  hasFloatingDock = false,
  onLocaleChange,
  translate,
  errorCode,
  children,
}: ShellProps) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof globalThis.matchMedia !== "function") return;

    const query = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);

    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return (
    <div
      className={
        hasFloatingDock
          ? "flex min-h-screen flex-col bg-paper pb-24"
          : "flex min-h-screen flex-col bg-paper"
      }
      data-reduced-motion={reducedMotion}
    >
      <header className="relative flex flex-col items-center gap-2 px-4 pt-6 pb-4 text-center">
        <BrandMark translate={translate} />
        <nav className="absolute top-5 right-4 flex gap-1.5">
          {(["en-US", "pt-BR"] as const).map((option) => (
            <button
              aria-pressed={locale === option}
              className="min-h-8 cursor-pointer rounded-full border border-ink/25 px-3 py-1 font-sans text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-dim transition-colors hover:border-ink hover:text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
              key={option}
              type="button"
              onClick={() => onLocaleChange(option)}
            >
              {option === "en-US" ? "EN" : "PT"}
            </button>
          ))}
        </nav>
      </header>

      {sessionName !== null && sessionName.length > 0 && (
        <div className="px-4 pb-3">
          <p className="session-name">{sessionName}</p>
        </div>
      )}

      {errorCode !== null && (
        <p
          className="mx-4 mb-3 rounded-2xl bg-primary/10 px-3.5 py-2 text-[0.8125rem] font-semibold text-primary"
          role="alert"
        >
          {translate(`errors.${errorCode}`)}
        </p>
      )}

      {/**
       * The chrome stays pinned and only the content moves, so the wordmark and the
       * credit keep their place while the room itself sits in the middle of whatever
       * room is left over. The frame is what does the centring horizontally, and
       * because its cap is in rem it widens with the fluid root instead of sitting at
       * one fixed column on a large display.
       */}
      <main className="flex flex-1 flex-col items-center justify-center">
        <div className="mx-auto flex w-full max-w-115 flex-col" data-frame>
          {children}
        </div>
      </main>

      <Signature translate={translate} />
    </div>
  );
}