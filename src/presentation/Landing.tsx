import { useState } from "react";
import { CreateRoomError, createRoom } from "@application/createRoom";
import { roomPath } from "@application/routing";
import type { Translator } from "@application/i18n";
import { Button } from "@presentation/ui";

export interface LandingProps {
  translate: Translator;
  onNavigate: (path: string) => void;
  notice?: string | null;
}

export function Landing({ translate, onNavigate, notice = null }: LandingProps) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function openRoom() {
    if (pending) return;

    setPending(true);
    setFailed(false);

    try {
      const roomId = await createRoom();
      onNavigate(roomPath(roomId));
    } catch (error) {
      if (error instanceof CreateRoomError) {
        setFailed(true);
        setPending(false);
        return;
      }
      throw error;
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-115 flex-col items-center gap-stack px-gutter pt-room text-center">
      <Button
        className="min-h-13 px-gutter text-[0.9375rem]"
        disabled={pending}
        variant="primary"
        onClick={() => {
          void openRoom();
        }}
      >
        {pending ? translate("landing.creating") : translate("landing.create")}
      </Button>

      {notice !== null && (
        <p
          className="w-full rounded-2xl border border-line bg-paper-raised px-snug py-tight text-[0.8125rem] font-semibold text-ink-dim"
          role="status"
        >
          {translate(`errors.${notice}`)}
        </p>
      )}

      {failed && (
        <p className="m-0 rounded-2xl bg-primary/10 px-snug py-tight text-[0.8125rem] font-semibold text-primary" role="alert">
          {translate("landing.failed")}
        </p>
      )}

      <ol className="mt-1 flex list-none flex-col gap-tight border-t border-line pt-room text-left text-[0.8125rem] text-ink-dim">
        <li className="flex gap-snug"><span className="mt-0.5 font-display text-[0.6875rem] font-bold text-primary">01</span><span>{translate("landing.stepOne")}</span></li>
        <li className="flex gap-snug"><span className="mt-0.5 font-display text-[0.6875rem] font-bold text-primary">02</span><span>{translate("landing.stepTwo")}</span></li>
        <li className="flex gap-snug"><span className="mt-0.5 font-display text-[0.6875rem] font-bold text-primary">03</span><span>{translate("landing.stepThree")}</span></li>
      </ol>
    </section>
  );
}