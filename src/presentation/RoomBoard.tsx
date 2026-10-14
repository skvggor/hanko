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
import { Button, Chip, GoldGlint, Label, Meter, OwnerName, Panel, Tooltip } from "@presentation/ui";
import { ShareSnippet } from "@presentation/ShareSnippet";
import { PromptDialog } from "@presentation/PromptDialog";
import { validateName } from "@domain/name";
import {
  ArrowCounterClockwiseIcon,
  CrownIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilSimpleIcon,
  SlidersHorizontalIcon,
  TrashIcon,
  UserMinusIcon,
  UsersIcon,
} from "@phosphor-icons/react";

export interface RoomBoardProps {
  state: PublicRoomState;
  myParticipantId: string | null;
  roomId: string;
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

/**
 * Pressed and unpressed are different affordances rather than two shades of one.
 */
function miniButtonClasses(pressed: boolean, tone: "neutral" | "primary"): string {
  if (!pressed) return "text-ink-dim hover:bg-ink/8 hover:text-ink";

  return tone === "primary" ? "bg-primary text-on-primary" : "bg-ink text-paper";
}

/**
 * The phone needs a thumb sized target, so the button grows below the small
 * breakpoint and keeps the compact size the settled desktop layout already has.
 */
function MiniButton({
  ariaLabel,
  children,
  onClick,
  pressed = false,
  tone = "neutral",
}: Readonly<{
  ariaLabel?: string | undefined;
  children: React.ReactNode;
  onClick: () => void;
  pressed?: boolean;
  tone?: "neutral" | "primary";
}>) {
  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={pressed}
      className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-1 rounded-full px-snug py-1 font-sans text-[0.625rem] font-semibold tracking-[0.06em] uppercase transition-colors sm:min-h-8 sm:min-w-8 ${miniButtonClasses(pressed, tone)}`}
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
  roomId,
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
}: Readonly<RoomBoardProps>) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const amOwner = state.ownerId !== null && state.ownerId === myParticipantId;
  const voted = readVotedState(state);

  const progressLabel = voted.complete
    ? translate("progress.allVoted")
    : translate("progress.waiting", { count: voted.pending });

  const voters = state.participants.filter((entry) => entry.role === "voter").length;
  const watchers = state.participants.length - voters;
  // The owner leads the list because the room is theirs to run, and whoever is reading
  // follows them so their own row is never lost among the rest. Both settle in front of
  // the join order, which holds the rest steady.
  const orderedParticipants = [...state.participants].sort((left, right) => {
    if (left.isOwner !== right.isOwner) return left.isOwner ? -1 : 1;

    const leftIsMine = left.id === myParticipantId;
    const rightIsMine = right.id === myParticipantId;
    if (leftIsMine !== rightIsMine) return leftIsMine ? -1 : 1;

    return 0;
  });

  return (
    <div className="flex flex-col gap-snug px-gutter">
      <Panel className="flex flex-col gap-snug p-room sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-snug">
          <span className="rounded-chip bg-ink/8 px-snug py-1 text-[0.6875rem] font-semibold tracking-[0.04em] text-ink-dim">
            {translate("room.round", { round: state.round })}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-ink-dim">
            <UsersIcon aria-hidden="true" size={15} weight="bold" />
            {translate("room.connected", { count: state.connectedCount })}
          </span>
        </div>

        <div className="min-w-0 sm:ml-auto">
          <ShareSnippet
            copied={copied}
            copyLabel={translate("room.copyLink")}
            copiedLabel={translate("room.copied")}
            label={translate("room.invite")}
            onCopy={onCopyLink}
            roomId={roomId}
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

      <Panel aria-label={translate("a11y.participantList")}>
        {orderedParticipants.map((participant) => {
          const isMe = participant.id === myParticipantId;
          const isVoter = participant.role === "voter";
          const showVoteState = isVoter && !state.isRevealed;
          const hasControls = isMe || amOwner;
          const renameLabel = translate("controls.rename");
          const transferLabel = translate("controls.transferOwnership");
          const roleLabel = isVoter
            ? translate("controls.changeRole")
            : translate("controls.changeToVoter");
          const removeLabel = translate("controls.removeParticipant");

          /**
           * A phone gets two lines per person: the name, its badges and the vote state
           * on one baseline first, then the controls below them. Every piece of text
           * rides the name's baseline at every width, so the small caps of a chip read
           * as part of the same line as the name instead of floating over it, and the
           * row centres the two groups so the vertical balance holds either way.
           */
          return (
            <div
              className={`relative flex min-h-12 flex-wrap items-center gap-x-snug gap-y-tight border-b border-line px-room py-snug last:border-b-0 hover:z-10 focus-within:z-10 sm:flex-nowrap ${participant.isConnected ? "" : "opacity-50"}`}
              data-participant-row={participant.id}
              key={participant.id}
            >
              <div
                className="flex min-w-0 items-baseline gap-x-snug"
                data-line="identity"
              >
                {participant.isOwner ? (
                  <OwnerName
                    name={participant.name}
                    roleLabel={translate("controls.ownerControls")}
                  />
                ) : (
                  <span className="min-w-0 truncate text-[0.9375rem] font-semibold text-ink">
                    {participant.name}
                  </span>
                )}

                {isMe && <Chip tone="primary">{translate("room.youBadge")}</Chip>}

                {!isVoter && (
                  <Chip>
                    <EyeSlashIcon aria-hidden="true" size={10} weight="bold" />
                    {translate("room.spectatorBadge")}
                  </Chip>
                )}

                {showVoteState && (
                  <Chip tone={participant.hasVoted ? "secondary" : "neutral"}>
                    {participant.hasVoted
                      ? translate("progress.allVotedShort")
                      : translate("room.waitingForVoteShort")}
                  </Chip>
                )}
              </div>

              {hasControls && (
                <span
                  className="ml-auto flex w-full shrink-0 items-center justify-end gap-1.5 sm:w-auto"
                  data-line="controls"
                >
                  {isMe && (
                    <Tooltip label={renameLabel}>
                      <MiniButton
                        ariaLabel={renameLabel}
                        onClick={() => setRenaming(participant.name)}
                      >
                        <PencilSimpleIcon aria-hidden="true" size={16} weight="bold" />
                      </MiniButton>
                    </Tooltip>
                  )}

                  {amOwner && (
                    <Tooltip label={roleLabel}>
                      <MiniButton
                        ariaLabel={roleLabel}
                        onClick={() =>
                          onSetRole(
                            participant.id,
                            isVoter ? "spectator" : "voter",
                          )
                        }
                      >
                        {isVoter ? (
                          <EyeSlashIcon aria-hidden="true" size={16} weight="bold" />
                        ) : (
                          <EyeIcon aria-hidden="true" size={16} weight="bold" />
                        )}
                      </MiniButton>
                    </Tooltip>
                  )}

                  {amOwner && !isMe && (
                    <>
                      <Tooltip label={transferLabel}>
                        <MiniButton
                          ariaLabel={transferLabel}
                          onClick={() => onTransferOwnership(participant.id)}
                        >
                          <span className="relative flex overflow-hidden text-accent-deep">
                            <CrownIcon aria-hidden="true" size={16} weight="fill" />
                            <GoldGlint />
                          </span>
                        </MiniButton>
                      </Tooltip>
                      <Tooltip label={removeLabel}>
                        <MiniButton
                          ariaLabel={removeLabel}
                          onClick={() => onRemoveParticipant(participant.id)}
                        >
                          <UserMinusIcon aria-hidden="true" size={16} weight="bold" />
                        </MiniButton>
                      </Tooltip>
                    </>
                  )}
                </span>
              )}

              {showVoteState && (
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
                <ArrowCounterClockwiseIcon aria-hidden="true" size={16} weight="bold" />
                {translate("controls.nextRound")}
              </Button>
            ) : (
              <Button onClick={onReveal} variant="primary">
                <EyeIcon aria-hidden="true" size={16} weight="bold" />
                {translate("controls.reveal")}
              </Button>
            )}

            <Button onClick={onResetRound} variant="quiet">
              <TrashIcon aria-hidden="true" size={16} weight="bold" />
              {translate("controls.resetRound")}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-tight border-t border-line pt-snug">
            <span className="inline-flex items-center gap-1 text-ink-faint">
              <SlidersHorizontalIcon aria-hidden="true" size={14} weight="bold" />
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
            <TrashIcon aria-hidden="true" size={16} weight="bold" />
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
}: Readonly<SessionNameFieldProps>) {
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
