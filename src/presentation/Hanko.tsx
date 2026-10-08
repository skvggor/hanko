import { useState } from "react";
import type { PublicRoomState } from "@domain/protocol";
import { getDeck } from "@domain/deck";
import type { Translator } from "@application/i18n";
import { HankoStamp } from "@presentation/InkStamp";
import { RevealSheet } from "@presentation/RevealSheet";
import { Label, Panel } from "@presentation/ui";

export interface HankoProps {
  state: PublicRoomState;
  myParticipantId: string | null;
  translate: Translator;
  onVote: (value: string) => void;
}

function voteLabel(value: string, translate: Translator): string {
  return value === "coffee" ? translate("vote.coffee") : value;
}

export function Hanko({ state, myParticipantId, translate, onVote }: HankoProps) {
  const me = state.participants.find((entry) => entry.id === myParticipantId);
  const isSpectator = me?.role === "spectator";
  const values = getDeck(state.deckId);
  const myVote = state.myVote;
  const [pressId, setPressId] = useState(0);

  return (
    <Panel className="mx-4 mt-3 mb-4 flex flex-col gap-3.5 p-4">
      <Label>{translate("vote.prompt")}</Label>

      {!state.isRevealed && !isSpectator && (
        <HankoStamp myVote={myVote} pressId={pressId} translate={translate} />
      )}

      {state.isRevealed ? (
        <RevealSheet
          entries={state.reveals ?? []}
          key={state.round}
          scale={values}
          translate={translate}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(54px,1fr))] gap-2">
          {values.map((value) => {
            const isMine = myVote === value;
            const label = voteLabel(value, translate);

            return (
              <button
                aria-label={
                  isMine
                    ? translate("a11y.selectedVote", { value: label })
                    : translate("a11y.voteButton", { value: label })
                }
                aria-pressed={isMine}
                className="aspect-square min-h-11 cursor-pointer rounded-2xl border border-ink/20 bg-paper-raised px-0.5 font-display text-[clamp(0.9375rem,4.2vw,1.375rem)] font-bold text-ink transition-all duration-100 hover:-translate-y-0.5 hover:border-ink hover:shadow-[0_4px_0_0_var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-on-primary"
                disabled={isSpectator}
                key={value}
                type="button"
                onClick={() => {
                  setPressId((current) => current + 1);
                  onVote(value);
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {!state.isRevealed && (
        <p className="m-0 text-[0.6875rem] leading-relaxed text-ink-faint">
          {isSpectator
            ? translate("room.waitingForVote")
            : translate("vote.hint")}
        </p>
      )}
    </Panel>
  );
}