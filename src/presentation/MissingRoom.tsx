import { createRoom, CreateRoomError } from "@application/createRoom";
import { roomPath } from "@application/routing";
import type { Translator } from "@application/i18n";
import { Button } from "@presentation/ui";
import { useState } from "react";

export interface MissingRoomProps {
  translate: Translator;
  onNavigate: (path: string) => void;
}

/**
 * A room link that cannot be minted is not a room that is missing, so this does not
 * claim otherwise. The id was rejected before anything was looked up, and the useful
 * thing to say is that the link itself is wrong, because otherwise landing here looks
 * like the room was deleted and the reader goes looking for a way to recover it.
 */
export function MissingRoom({ translate, onNavigate }: MissingRoomProps) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function openRoom() {
    if (pending) return;

    setPending(true);
    setFailed(false);

    try {
      onNavigate(roomPath(await createRoom()));
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
    <section className="flex w-full flex-col items-center gap-room text-center">
      <h2 className="font-display m-0 text-[1.375rem] leading-tight font-bold tracking-[-0.02em] text-ink">
        {translate("room.missingTitle")}
      </h2>
      <p className="m-0 max-w-[36ch] text-[0.8125rem] leading-relaxed text-ink-dim">
        {translate("room.missingLink")}
      </p>

      <Button
        className="mt-snug"
        disabled={pending}
        variant="primary"
        onClick={() => {
          void openRoom();
        }}
      >
        {pending ? translate("landing.creating") : translate("landing.create")}
      </Button>

      {failed && (
        <p
          className="m-0 rounded-2xl bg-primary/10 px-snug py-tight text-[0.8125rem] font-semibold text-primary"
          role="alert"
        >
          {translate("landing.failed")}
        </p>
      )}
    </section>
  );
}
