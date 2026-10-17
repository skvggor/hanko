import { useEffect, useRef } from "react";
import { Button } from "@presentation/ui";

export interface ConfirmDialogProps {
  title: string;
  body: string;
  acceptLabel: string;
  cancelLabel: string;
  onAccept: () => void;
  onCancel: () => void;
}

/**
 * A confirmation that can actually be refused. Focus starts on the safe answer rather
 * than the destructive one, because a dialog opened by a stray Enter keypress should
 * never be confirmed by the same keypress. Focus is trapped inside while it is open and
 * handed back to whatever opened it on the way out, so keyboard and screen reader users
 * do not get dumped at the top of the document.
 */
export function ConfirmDialog({
  title,
  body,
  acceptLabel,
  cancelLabel,
  onAccept,
  onCancel,
}: Readonly<ConfirmDialogProps>) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const activeElement = globalThis.document.activeElement;
    openerRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    cancelRef.current?.focus();

    return () => openerRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }

    globalThis.document?.addEventListener("keydown", onKeyDown);
    return () => globalThis.document?.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-room"
      data-open="true"
    >
      <dialog
        aria-labelledby="confirm-delete-title"
        aria-modal="true"
        className="static w-full max-w-88 rounded-3xl border border-line bg-paper-raised p-room text-center shadow-[0_18px_0_-6px_var(--color-ink)]"
        open
      >
        <h2
          className="font-display m-0 text-[1.1875rem] leading-tight font-bold text-ink"
          id="confirm-delete-title"
        >
          {title}
        </h2>
        <p className="mt-snug mb-0 text-[0.8125rem] leading-relaxed text-ink-dim">{body}</p>
        <div className="confirm-dialog__actions mt-room flex flex-nowrap justify-center gap-tight">
          <Button className="shrink-0 px-snug" onClick={onCancel} ref={cancelRef} variant="quiet">
            {cancelLabel}
          </Button>
          <Button className="shrink-0 px-snug" onClick={onAccept} variant="danger">
            {acceptLabel}
          </Button>
        </div>
      </dialog>
    </div>
  );
}
