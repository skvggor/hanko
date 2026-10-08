import { useEffect, useRef, useState } from "react";
import { Button } from "@presentation/ui";

export interface PromptDialogProps {
  title: string;
  label: string;
  initialValue: string;
  acceptLabel: string;
  cancelLabel: string;
  /** Returns a reason to stay open, or null once the value is acceptable. */
  validate: (value: string) => string | null;
  onAccept: (value: string) => void;
  onCancel: () => void;
}

/**
 * The in-app replacement for window.prompt. A native prompt puts an OS chrome panel in
 * the middle of a sheet of paper, cannot be styled, cannot be translated past its own
 * title, and renders identically on every platform. This one is a dialog like any other,
 * with the same focus handling as ConfirmDialog and the same reason for existing.
 */
export function PromptDialog({
  title,
  label,
  initialValue,
  acceptLabel,
  cancelLabel,
  validate,
  onAccept,
  onCancel,
}: PromptDialogProps) {
  const [draft, setDraft] = useState(initialValue);
  const [problem, setProblem] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fieldRef.current?.focus();
    fieldRef.current?.select();
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

  function submit() {
    const reason = validate(draft);

    if (reason !== null) {
      setProblem(reason);
      return;
    }

    setProblem(null);
    onAccept(draft);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-gutter"
      data-open="true"
    >
      <div
        aria-labelledby="prompt-dialog-title"
        aria-modal="true"
        className="flex w-full max-w-88 flex-col gap-snug rounded-3xl border border-line bg-paper-raised p-room shadow-[0_18px_0_-6px_var(--color-ink)]"
        role="dialog"
      >
        <h2
          className="font-display m-0 text-[1.1875rem] leading-tight font-bold text-ink"
          id="prompt-dialog-title"
        >
          {title}
        </h2>

        <label
          className="m-0 text-[0.625rem] font-semibold tracking-[0.16em] text-ink-faint uppercase"
          htmlFor="prompt-dialog-field"
        >
          {label}
        </label>

        <input
          className="session-input min-h-11 w-full rounded-2xl border border-ink/20 bg-paper px-snug py-tight font-sans text-[0.9375rem] text-ink aria-invalid:border-primary"
          id="prompt-dialog-field"
          ref={fieldRef}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setProblem(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />

        {problem !== null && (
          <p className="m-0 text-[0.8125rem] font-semibold text-primary" role="alert">
            {problem}
          </p>
        )}

        <div className="mt-tight flex flex-wrap justify-end gap-tight">
          <Button onClick={onCancel} variant="quiet">
            {cancelLabel}
          </Button>
          <Button onClick={submit} variant="primary">
            {acceptLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
