import { useState, type Ref } from "react";
import type { PublicRoomState } from "@domain/protocol";
import type { DeckId } from "@domain/deck";
import {
  SESSION_NAME_MAX_LENGTH,
  validateSessionName,
} from "@domain/sessionName";
import { DECK_IDS } from "@domain/deck";
import type { Translator } from "@application/i18n";
import { readVotedState } from "@application/votedState";
import { Button, Chip, Label, Meter, OwnerBadge, Panel } from "@presentation/ui";
import { ShareSnippet } from "@presentation/ShareSnippet";
import { PromptDialog } from "@presentation/PromptDialog";
import { validateName } from "@domain/name";
import {
  ArrowCounterClockwise,
  Crown,
  Eye,
  EyeSlash,
  PencilSimple,
  SlidersHorizontal,
  Trash,
  UserMinus,
  Users,
} from "@phosphor-icons/react";

export interface RoomBoardProps {
  state: PublicRoomState;
  myParticipantId: string | null;
  shareUrl: string;
  translate: Translator;
  copied: boolean;
  onCopyLink: () => void;
  onReveal: () => void;
  onNextRound: () => void;
  onResetRound: () => void;
  onSetDeck: (deckId: DeckId) => void;
  onDeleteRoom: () => void;
  onTransferOwnership: (participantId: string) => void;
  onRemoveParticipant: (participantId: string) => void;
  onSetRole: (participantId: string, role: "voter" | "spectator") => void;
  onSetRoomName: (name: string | null) => void;
  onRename: (name: string) => void;
  /**
   * The confirmation for deleting lives one level up, so focus has a way back to the
   * button that opened it when the owner decides not to go through with it.
   */
  deleteButtonRef?: Ref<HTMLButtonElement> | undefined;
}

function MiniButton({
  children,
  onClick,
  pressed = false,
  tone = "neutral",
}: {
  children: React.ReactNode;
  onClick: () => void;
  pressed?: boolean;
  tone?: "neutral" | "primary";
}) {
  return (
    <button
      aria-pressed={pressed}
      className={`inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full px-snug py-1 font-sans text-[0.625rem] font-semibold tracking-[0.06em] uppercase transition-colors ${
        pressed
          ? tone === "primary"
            ? "bg-primary text-on-primary"
            : "bg-ink text-paper"
          : "text-ink-dim hover:bg-ink/8 hover:text-ink"
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function RoomBoard({
  state,
  myParticipantId,
  shareUrl,
  translate,
  copied,
  onCopyLink,
  onReveal,
  onNextRound,
  onResetRound,
  onSetDeck,
  onDeleteRoom,
  onTransferOwnership,
  onRemoveParticipant,
  onSetRole,
  onSetRoomName,
  onRename,
  deleteButtonRef,
}: RoomBoardProps) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const amOwner = state.ownerId !== null && state.ownerId === myParticipantId;
  const voted = readVotedState(state);

  const progressLabel = voted.complete
    ? translate("progress.allVoted")
    : translate("progress.waiting", { count: voted.pending });

  const voters = state.participants.filter((entry) => entry.role === "voter").length;
  const watchers = state.participants.length - voters;

  return (
    <div className="flex flex-col gap-snug px-gutter">
      <Panel className="flex flex-col gap-snug p-room sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-snug">
          <span className="rounded-chip bg-ink/8 px-snug py-1 text-[0.6875rem] font-semibold tracking-[0.04em] text-ink-dim">
            {translate("room.round", { round: state.round })}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-ink-dim">
            <Users aria-hidden="true" size={15} weight="bold" />
            {translate("room.connected", { count: state.connectedCount })}
          </span>
        </div>

        <div className="min-w-0 flex-1 sm:max-w-72">
          <ShareSnippet
            copied={copied}
            copyLabel={translate("room.copyLink")}
            copiedLabel={translate("room.copied")}
            label={translate("room.invite")}
            onCopy={onCopyLink}
            url={shareUrl}
          />
        </div>
      </Panel>

      {state.participants.length > 0 && !state.isRevealed && (
        <Panel className="flex flex-col gap-tight p-room">
          <div className="flex flex-wrap items-center justify-between gap-x-snug gap-y-1">
            <span
              className={`text-[0.8125rem] font-semibold ${voted.complete ? "text-secondary" : "text-ink"}`}
            >
              {progressLabel}
            </span>
            <span className="flex items-center gap-1.5">
              {voters > 0 && (
                <Chip tone="primary">
                  {voters === 1
                    ? translate("progress.votersOnlyOne", { count: voters })
                    : translate("progress.votersOnly", { count: voters })}
                </Chip>
              )}
              {watchers > 0 && (
                <Chip>{translate("progress.watching", { count: watchers })}</Chip>
              )}
            </span>
          </div>
          <Meter
            label={progressLabel}
            pending={!voted.complete}
            tone={voted.complete ? "secondary" : "primary"}
            value={voted.share}
          />
        </Panel>
      )}

      <Panel aria-label={translate("a11y.participantList")} className="overflow-hidden">
        {state.participants.map((participant) => {
          const isMe = participant.id === myParticipantId;
          const isVoter = participant.role === "voter";

          return (
            <div
              className={`flex min-h-12 flex-wrap items-center gap-x-snug gap-y-1 border-b border-line px-room py-snug last:border-b-0 ${participant.isConnected ? "" : "opacity-50"}`}
              key={participant.id}
            >
              <span className="text-[0.9375rem] font-semibold text-ink">
                {participant.name}
              </span>

              {participant.isOwner && (
                <OwnerBadge label={translate("controls.ownerControls")} />
              )}

              {!isVoter && (
                <Chip>
                  <EyeSlash aria-hidden="true" size={10} weight="bold" />
                  {translate("room.spectatorBadge")}
                </Chip>
              )}

              {isVoter && !state.isRevealed && (
                <Chip tone={participant.hasVoted ? "secondary" : "neutral"}>
                  {participant.hasVoted
                    ? translate("progress.allVotedShort")
                    : translate("room.waitingForVote")}
                </Chip>
              )}

              <span className="ml-auto flex flex-wrap items-center gap-1.5">
                {isMe && (
                  <MiniButton onClick={() => setRenaming(participant.name)}>
                    <PencilSimple aria-hidden="true" size={12} weight="bold" />
                    {translate("controls.rename")}
                  </MiniButton>
                )}

                {amOwner && !isMe && (
                  <>
                    <MiniButton onClick={() => onTransferOwnership(participant.id)}>
                      <Crown aria-hidden="true" size={12} weight="fill" />
                      {translate("controls.transferOwnership")}
                    </MiniButton>
                    <MiniButton
                      onClick={() =>
                        onSetRole(
                          participant.id,
                          isVoter ? "spectator" : "voter",
                        )
                      }
                    >
                      {isVoter
                        ? translate("controls.changeRole")
                        : translate("controls.changeToVoter")}
                    </MiniButton>
                    <MiniButton onClick={() => onRemoveParticipant(participant.id)}>
                      <UserMinus aria-hidden="true" size={12} weight="bold" />
                      {translate("controls.removeParticipant")}
                    </MiniButton>
                  </>
                )}
              </span>

              {isVoter && !state.isRevealed && (
                <span className="visually-hidden">
                  {participant.hasVoted
                    ? translate("a11y.votedMarker", { name: participant.name })
                    : translate("a11y.pendingMarker", { name: participant.name })}
                </span>
              )}
            </div>
          );
        })}
      </Panel>

      {amOwner && (
        <Panel className="flex flex-col gap-snug p-room">
          <div className="flex flex-wrap items-center gap-tight">
            {state.isRevealed ? (
              <Button onClick={onNextRound} variant="primary">
                <ArrowCounterClockwise aria-hidden="true" size={16} weight="bold" />
                {translate("controls.nextRound")}
              </Button>
            ) : (
              <Button onClick={onReveal} variant="primary">
                <Eye aria-hidden="true" size={16} weight="bold" />
                {translate("controls.reveal")}
              </Button>
            )}

            <Button onClick={onResetRound} variant="quiet">
              <Trash aria-hidden="true" size={16} weight="bold" />
              {translate("controls.resetRound")}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-tight border-t border-line pt-snug">
            <span className="inline-flex items-center gap-1 text-ink-faint">
              <SlidersHorizontal aria-hidden="true" size={14} weight="bold" />
              <Label>{translate("controls.changeDeck")}</Label>
            </span>
            {DECK_IDS.map((deckId) => (
              <MiniButton
                key={deckId}
                onClick={() => onSetDeck(deckId)}
                pressed={state.deckId === deckId}
                tone="primary"
              >
                {translate(`controls.deck.${deckId}`)}
              </MiniButton>
            ))}
          </div>

          <SessionNameField
            current={state.name}
            onSetRoomName={onSetRoomName}
            translate={translate}
          />

          <Button
            className="self-start"
            onClick={onDeleteRoom}
            ref={deleteButtonRef}
            variant="danger"
          >
            <Trash aria-hidden="true" size={16} weight="bold" />
            {translate("controls.deleteRoom")}
          </Button>
        </Panel>
      )}

      {renaming !== null && (
        <PromptDialog
          acceptLabel={translate("controls.renameSave")}
          cancelLabel={translate("controls.renameCancel")}
          initialValue={renaming}
          label={translate("join.placeholder")}
          title={translate("controls.rename")}
          validate={(value) => {
            const validation = validateName(value);
            return validation.valid ? null : translate(`session.${validation.reason}`);
          }}
          onAccept={(value) => {
            setRenaming(null);
            onRename(value);
          }}
          onCancel={() => setRenaming(null)}
        />
      )}
    </div>
  );
}
interface SessionNameFieldProps {
  current: string | null;
  onSetRoomName: (name: string | null) => void;
  translate: Translator;
}

function SessionNameField({
  current,
  onSetRoomName,
  translate,
}: SessionNameFieldProps) {
  const [draft, setDraft] = useState(current ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const [seenCurrent, setSeenCurrent] = useState(current);

  if (current !== seenCurrent) {
    setSeenCurrent(current);
    setDraft(current ?? "");
  }

  const submit = () => {
    const raw = draft.trim();
    if (raw.length === 0) {
      onSetRoomName(null);
      setProblem(null);
      return;
    }

    const validation = validateSessionName(raw);
    if (!validation.valid) {
      setProblem(`session.${validation.reason}`);
      return;
    }

    setProblem(null);
    onSetRoomName(validation.name);
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      <label
        className="m-0 text-[0.625rem] font-semibold tracking-[0.16em] text-ink-faint uppercase"
        htmlFor="session-name"
      >
        {translate("session.label")}
      </label>
      <div className="flex items-center gap-tight">
        <input
          className="session-input"
          id="session-name"
          maxLength={SESSION_NAME_MAX_LENGTH}
          placeholder={translate("session.placeholder")}
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
        <MiniButton onClick={submit} tone="primary">
          {translate("session.save")}
        </MiniButton>
      </div>
      {problem !== null && (
        <p className="text-[0.6875rem] font-semibold text-primary" role="alert">
          {translate(problem)}
        </p>
      )}
    </div>
  );
}
