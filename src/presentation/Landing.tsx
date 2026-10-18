import type { Translator } from "@application/i18n";
import { BUILD_COMMIT } from "@config/version";
import { StartRoomAction } from "@presentation/StartRoomAction";
import { BrandMark } from "@presentation/Signature";

const STEPS = [
  { number: "01", title: "landing.stepOneTitle", description: "landing.stepOneBody" },
  { number: "02", title: "landing.stepTwoTitle", description: "landing.stepTwoBody" },
  { number: "03", title: "landing.stepThreeTitle", description: "landing.stepThreeBody" },
] as const;

export interface LandingProps {
  translate: Translator;
  onNavigate: (path: string) => void;
  notice?: string | null;
}

export function Landing({ translate, onNavigate, notice = null }: Readonly<LandingProps>) {
  return (
    <section className="mx-auto flex w-full max-w-115 flex-col items-center gap-stack px-gutter pt-room text-center">
      <BrandMark buildCommit={BUILD_COMMIT} size="hero" translate={translate} />

      <StartRoomAction
        buttonClassName="min-h-13 px-gutter text-[0.9375rem]"
        onNavigate={onNavigate}
        translate={translate}
      />

      {notice !== null && (
        <output className="w-full rounded-2xl border border-line bg-paper-raised px-snug py-tight text-[0.8125rem] font-semibold text-ink-dim">
          {translate(`errors.${notice}`)}
        </output>
      )}

      <ol
        aria-label={translate("landing.stepsLabel")}
        className="mt-1 grid w-full list-none grid-cols-1 gap-snug border-t border-line pt-snug text-left sm:grid-cols-3 sm:gap-tight"
      >
        {STEPS.map(({ number, title, description }) => (
          <li className="flex items-baseline gap-snug sm:flex-col sm:items-start sm:gap-tight" key={number}>
            <span
              aria-hidden="true"
              className="shrink-0 font-mono text-[0.625rem] font-bold tracking-[0.08em] text-primary"
            >
              {number}
            </span>
            <span className="flex min-w-0 flex-col gap-hair">
              <span className="font-display text-[0.8125rem] font-bold leading-tight text-ink">
                {translate(title)}
              </span>
              <span className="text-[0.6875rem] leading-relaxed text-ink-dim">
                {translate(description)}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
