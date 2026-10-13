import type { Translator } from "@application/i18n";
import { StartRoomAction } from "@presentation/StartRoomAction";
import { BrandMark } from "@presentation/Signature";

export interface LandingProps {
  translate: Translator;
  onNavigate: (path: string) => void;
  notice?: string | null;
}

export function Landing({ translate, onNavigate, notice = null }: Readonly<LandingProps>) {
  return (
    <section className="mx-auto flex w-full max-w-115 flex-col items-center gap-stack px-gutter pt-room text-center">
      <BrandMark size="hero" translate={translate} />

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

      <ol className="mt-1 flex list-none flex-col gap-tight border-t border-line pt-room text-left text-[0.8125rem] text-ink-dim">
        <li className="flex gap-snug"><span className="mt-0.5 font-display text-[0.6875rem] font-bold text-primary">01</span><span>{translate("landing.stepOne")}</span></li>
        <li className="flex gap-snug"><span className="mt-0.5 font-display text-[0.6875rem] font-bold text-primary">02</span><span>{translate("landing.stepTwo")}</span></li>
        <li className="flex gap-snug"><span className="mt-0.5 font-display text-[0.6875rem] font-bold text-primary">03</span><span>{translate("landing.stepThree")}</span></li>
      </ol>
    </section>
  );
}
