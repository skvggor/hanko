import { useEffect, useState, type ReactNode } from "react";
import type { Locale } from "@application/i18n";
import { BrandMark, Signature } from "@presentation/Signature";
import { ConfirmDialog } from "@presentation/ConfirmDialog";
import "@presentation/styles/theme.css";

/**
 * The server holds a disconnected seat for five minutes before reclaiming it, so the
 * warning quotes that window rather than promising the seat is saved forever.
 */
const GRACE_MINUTES = 5;

export interface ShellProps {
  locale: Locale;
  sessionName?: string | null;
  hasFloatingDock?: boolean;
  onLocaleChange: (locale: Locale) => void;
  onNavigateHome: () => void;
  /** Null when there is no room to leave, which is what lets the logo skip the warning. */
  onLeaveRoom: (() => void) | null;
  translate: (path: string, variables?: Record<string, string | number>) => string;
  errorCode: string | null;
  children: ReactNode;
}

export function Shell({
  locale,
  sessionName = null,
  hasFloatingDock = false,
  onLocaleChange,
  onNavigateHome,
  onLeaveRoom,
  translate,
  errorCode,
  children,
}: ShellProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [scrollable, setScrollable] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  /**
   * Walking out of a room is not the same as walking out of a room by accident. The seat
   * survives the grace window and then goes to whoever asks next, so the logo asks first
   * and the answer lives only as long as the room does.
   */
  function openLogo() {
    if (onLeaveRoom === null) {
      onNavigateHome();
      return;
    }

    setConfirmingLeave(true);
  }

  useEffect(() => {
    if (typeof globalThis.matchMedia !== "function") return;

    const query = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);

    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  /**
   * The chrome is pinned, so it stops being the only thing on screen and starts being a
   * lid over the content. It stays plain paper until there is actually something behind
   * it to blur, because frosting a surface that has nothing behind it only costs paint.
   */
  useEffect(() => {
    const sync = () => {
      setScrolled((globalThis.scrollY ?? 0) > 0);

      const height = globalThis.document?.documentElement.scrollHeight ?? 0;
      const viewport = globalThis.innerHeight ?? 0;
      setScrollable(height > viewport + 1);
    };

    sync();
    globalThis.addEventListener("scroll", sync, { passive: true });
    return () => globalThis.removeEventListener("scroll", sync);
  }, []);

  return (
    <div
      className="flex min-h-screen flex-col bg-paper"
      data-reduced-motion={reducedMotion}
    >
      {/**
       * Three tracks rather than a flex row: the middle one is sized to its content, so
       * the title centres on the bar itself instead of on whatever the wordmark and the
       * switcher happen to weigh. The outer tracks match each other, which is what keeps
       * the chrome symmetric around the title rather than nudged off centre by it.
       */}
      <header
        className="sticky top-0 z-20 grid h-[var(--chrome-height)] grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-tight border-b border-line px-gutter"
        data-glass={scrolled}
      >
        <button
          aria-label={translate("brand.goHome")}
          className="cursor-pointer"
          data-logo
          onClick={openLogo}
          type="button"
        >
          <BrandMark translate={translate} />
        </button>
        {/**
         * The slot is rendered even with nothing to put in it. A grid places children
         * by position, so an absent title would slide the switcher into the middle
         * track and strand it beside the wordmark on a room that has no name.
         */}
        <p className="session-name min-w-0 max-w-[46vw] truncate px-snug text-center" data-room-title>
          {sessionName ?? ""}
        </p>
        <nav className="flex justify-end gap-1.5">
          {(["en-US", "pt-BR"] as const).map((option) => (
            <button
              aria-pressed={locale === option}
              className="min-h-7 cursor-pointer rounded-full border border-ink/25 px-snug py-0.5 font-sans text-[0.625rem] font-semibold tracking-[0.08em] text-ink-dim transition-colors hover:border-ink hover:text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
              key={option}
              type="button"
              onClick={() => onLocaleChange(option)}
            >
              {option === "en-US" ? "EN" : "PT"}
            </button>
          ))}
        </nav>
      </header>

      {errorCode !== null && (
        <p
          className="mx-gutter mb-snug rounded-2xl bg-primary/10 px-snug py-tight text-[0.8125rem] font-semibold text-primary"
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
      <main
        className={`flex flex-1 flex-col items-center justify-center ${
          hasFloatingDock ? "pb-dock" : ""
        }`}
      >
        <div className="mx-auto flex w-full max-w-160 flex-col px-gutter pt-stack pb-stack" data-frame>
          {children}
        </div>
      </main>

      <Signature glass={scrollable} translate={translate} />

      {confirmingLeave && onLeaveRoom !== null && (
        <ConfirmDialog
          acceptLabel={translate("controls.confirmLeaveAccept")}
          body={
            sessionName === null || sessionName.length === 0
              ? translate("controls.confirmLeaveBody", { grace: GRACE_MINUTES })
              : `${sessionName} — ${translate("controls.confirmLeaveBody", { grace: GRACE_MINUTES })}`
          }
          cancelLabel={translate("controls.confirmLeaveCancel")}
          title={translate("controls.confirmLeaveTitle")}
          onAccept={() => {
            setConfirmingLeave(false);
            onLeaveRoom();
          }}
          onCancel={() => setConfirmingLeave(false)}
        />
      )}
    </div>
  );
}