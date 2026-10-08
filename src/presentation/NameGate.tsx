import { useState, type FormEvent } from "react";
import type { ParticipantRole } from "@domain/room";
import type { Translator } from "@application/i18n";
import { Button } from "@presentation/ui";

export interface NameGateProps {
  translate: Translator;
  suggestedName: string | null;
  onJoin: (name: string, role: ParticipantRole) => void;
}

export function NameGate({ translate, suggestedName, onJoin }: NameGateProps) {
  const [name, setName] = useState(suggestedName ?? "");
  const [role, setRole] = useState<ParticipantRole>("voter");
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      setError(translate("errors.name_required"));
      return;
    }
    onJoin(trimmed, role);
  }

  return (
    <form className="mx-auto flex w-full max-w-105 flex-col gap-3.5 px-4 pt-2 pb-4" onSubmit={submit}>
      <h2 className="font-display m-0 text-[1.625rem] leading-tight font-bold tracking-[-0.02em] text-ink">
        {translate("join.heading")}
      </h2>
      <p className="m-0 text-[0.8125rem] text-ink-dim">{translate("join.hint")}</p>

      <label
        className="text-[0.625rem] font-semibold tracking-[0.16em] text-ink-faint uppercase"
        htmlFor="gate-name"
      >
        {translate("join.placeholder")}
      </label>
      <input
        aria-invalid={error !== null}
        autoComplete="off"
        autoFocus
        className="min-h-12 w-full rounded-2xl border border-ink/20 bg-paper-raised px-4 py-3 font-sans text-[1.0625rem] text-ink aria-invalid:border-primary"
        id="gate-name"
        onChange={(event) => {
          setName(event.target.value);
          setError(null);
        }}
        placeholder={translate("join.placeholder")}
        value={name}
      />

      <fieldset className="m-0 flex flex-wrap gap-2 rounded-2xl border border-line bg-paper-raised p-2.5">
        <legend className="px-1 text-[0.625rem] font-semibold tracking-[0.16em] text-ink-faint uppercase">
          {translate("join.title")}
        </legend>
        {(["voter", "spectator"] as const).map((option) => (
          <button
            aria-pressed={role === option}
            className="min-h-10 flex-1 cursor-pointer rounded-full border border-ink/20 px-3 py-2 font-sans text-[0.6875rem] font-semibold tracking-[0.04em] text-ink-dim transition-colors hover:border-ink hover:text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
            key={option}
            type="button"
            onClick={() => setRole(option)}
          >
            {option === "voter"
              ? translate("join.participateInstead")
              : translate("join.watchInstead")}
          </button>
        ))}
      </fieldset>

      {error !== null && (
        <p className="m-0 text-[0.8125rem] font-semibold text-primary" role="alert">
          {error}
        </p>
      )}

      <Button disabled={!canSubmit} type="submit" variant="primary">
        {translate("join.submit")}
      </Button>
    </form>
  );
}
