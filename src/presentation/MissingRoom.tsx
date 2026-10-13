import type { Translator } from "@application/i18n";
import { StartRoomAction } from "@presentation/StartRoomAction";

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
export function MissingRoom({ translate, onNavigate }: Readonly<MissingRoomProps>) {
  return (
    <section className="flex w-full flex-col items-center gap-room text-center">
      <h2 className="font-display m-0 text-[1.375rem] leading-tight font-bold tracking-[-0.02em] text-ink">
        {translate("room.missingTitle")}
      </h2>
      <p className="m-0 max-w-[36ch] text-[0.8125rem] leading-relaxed text-ink-dim">
        {translate("room.missingLink")}
      </p>

      <StartRoomAction
        buttonClassName="mt-snug"
        onNavigate={onNavigate}
        translate={translate}
      />
    </section>
  );
}
