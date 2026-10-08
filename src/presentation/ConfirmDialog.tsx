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
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
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
      <div
        aria-labelledby="confirm-delete-title"
        aria-modal="true"
        className="w-full max-w-88 rounded-3xl border border-line bg-paper-raised p-room text-center shadow-[0_18px_0_-6px_var(--color-ink)]"
        role="dialog"
      >
        <h2
          className="font-display m-0 text-[1.1875rem] leading-tight font-bold text-ink"
          id="confirm-delete-title"
        >
          {title}
        </h2>
        <p className="mt-snug mb-0 text-[0.8125rem] leading-relaxed text-ink-dim">{body}</p>
        <div className="mt-room flex flex-wrap justify-center gap-tight">
          <Button onClick={onCancel} ref={cancelRef} variant="quiet">
            {cancelLabel}
          </Button>
          <Button onClick={onAccept} variant="danger">
            {acceptLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
