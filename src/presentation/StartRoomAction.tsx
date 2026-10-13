import { useState } from "react";
import { CreateRoomError, createRoom } from "@application/createRoom";
import { pendingAtLeast } from "@application/minimumPending";
import { roomPath } from "@application/routing";
import type { Translator } from "@application/i18n";
import { Button } from "@presentation/ui";

export interface StartRoomActionProps {
  buttonClassName?: string;
  onNavigate: (path: string) => void;
  translate: Translator;
}

/**
 * The call to start a room and the one failure it can have, kept together so a screen
 * that offers the action says the same thing about it as every other screen. Both the
 * landing page and the dead link screen are such a screen.
 */
export function StartRoomAction({
  buttonClassName = "",
  onNavigate,
  translate,
}: Readonly<StartRoomActionProps>) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function openRoom() {
    const startedAt = Date.now();

    setPending(true);
    setFailed(false);

    try {
      const roomId = await createRoom();
      await pendingAtLeast(startedAt);
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
    <>
      <Button
        busy={pending}
        className={buttonClassName}
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
    </>
  );
}
