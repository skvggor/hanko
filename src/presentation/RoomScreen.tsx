import { useCallback, useEffect, useMemo, useState } from "react";
import { MESSAGE_LIMIT, type ChatMessage } from "@domain/chat";
import type { PublicRoomState } from "@domain/protocol";
import type { DeckId } from "@domain/deck";
import type { ParticipantRole } from "@domain/room";
import { RoomConnection } from "@application/roomConnection";
import type { Translator } from "@application/i18n";
import { roomPath } from "@application/routing";
import { ChatPanel } from "@presentation/ChatPanel";
import { Hanko } from "@presentation/Hanko";
import { NameGate } from "@presentation/NameGate";
import { RoomBoard } from "@presentation/RoomBoard";

const TOKEN_PREFIX = "hanko:token:";
const NAME_PREFIX = "hanko:name:";

/**
 * Identity lives in sessionStorage so each tab is its own participant: a second tab
 * on the same browser must not inherit the first tab's token and take over its seat.
 * The name is a device level memory, used only to suggest a name on the way back in.
 */
function readStoredToken(roomId: string): string | null {
  try {
    return globalThis.sessionStorage?.getItem(`${TOKEN_PREFIX}${roomId}`) ?? null;
  } catch {
    return null;
  }
}

function writeStoredToken(roomId: string, token: string): void {
  try {
    globalThis.sessionStorage?.setItem(`${TOKEN_PREFIX}${roomId}`, token);
  } catch {
    // storage unavailable, the session simply will not survive a reload
  }
}

function readStoredName(roomId: string): string | null {
  try {
    return globalThis.localStorage?.getItem(`${NAME_PREFIX}${roomId}`) ?? null;
  } catch {
    return null;
  }
}

function writeStoredName(roomId: string, name: string): void {
  try {
    globalThis.localStorage?.setItem(`${NAME_PREFIX}${roomId}`, name);
  } catch {
    // storage unavailable
  }
}

export interface RoomScreenProps {
  roomId: string;
  onSessionNameChange?: (name: string | null) => void;
  translate: Translator;
}

export function RoomScreen({ roomId, onSessionNameChange, translate }: RoomScreenProps) {
  const [state, setState] = useState<PublicRoomState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState<ParticipantRole>("voter");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [wasRemoved, setWasRemoved] = useState(false);
  const [copied, setCopied] = useState(false);

  const connection = useMemo(() => new RoomConnection(roomId), [roomId]);
  const storedToken = useMemo(() => readStoredToken(roomId), [roomId]);
  const suggestedName = useMemo(() => readStoredName(roomId), [roomId]);

  const shareUrl = useMemo(
    () => `${globalThis.location?.origin ?? ""}${roomPath(roomId)}`,
    [roomId],
  );

  useEffect(() => {
    const unsubscribeState = connection.subscribe((next) => {
      setState(next);
      setMessages(next.messages);
    });
    const unsubscribeChat = connection.onChatMessage((message) => {
      setMessages((previous) => [...previous, message].slice(-MESSAGE_LIMIT));
    });
    const unsubscribeError = connection.onError(setErrorCode);
    const unsubscribeDeleted = connection.onDeleted(() => {
      setErrorCode("room_deleted");
    });
    const unsubscribeRemoved = connection.onRemoved(() => {
      setWasRemoved(true);
    });

    return () => {
      unsubscribeState();
      unsubscribeChat();
      unsubscribeError();
      unsubscribeDeleted();
      unsubscribeRemoved();
      connection.close();
    };
  }, [connection]);

  useEffect(() => {
    if (draftName === null) return;
    void connection.join(draftName, draftRole, storedToken);
  }, [connection, draftName, draftRole, storedToken]);

  const join = useCallback(
    (name: string, role: ParticipantRole) => {
      setDraftName(name);
      setDraftRole(role);
      writeStoredName(roomId, name);
    },
    [roomId],
  );

  const handleReveal = useCallback(() => connection.reveal(), [connection]);
  const handleNextRound = useCallback(() => connection.nextRound(), [connection]);
  const handleResetRound = useCallback(() => connection.resetRound(), [connection]);
  const handleSetDeck = useCallback(
    (deckId: DeckId) => connection.setDeck(deckId),
    [connection],
  );
  const handleDeleteRoom = useCallback(() => connection.deleteRoom(), [connection]);
  const handleTransferOwnership = useCallback(
    (participantId: string) => connection.transferOwnership(participantId),
    [connection],
  );
  const handleRemoveParticipant = useCallback(
    (participantId: string) => connection.removeParticipant(participantId),
    [connection],
  );
  const handleSetRole = useCallback(
    (participantId: string, role: ParticipantRole) =>
      connection.setRole(participantId, role),
    [connection],
  );
  const handleRename = useCallback(
    (name: string) => connection.rename(name),
    [connection],
  );
  const handleVote = useCallback(
    (value: string) => connection.vote(value),
    [connection],
  );
  const handleSetRoomName = useCallback(
    (name: string | null) => connection.setRoomName(name),
    [connection],
  );
  const handleSendMessage = useCallback(
    (text: string) => connection.sendMessage(text),
    [connection],
  );
  const handleClearMessages = useCallback(
    () => connection.clearMessages(),
    [connection],
  );

  const handleCopyLink = useCallback(() => {
    void globalThis.navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
  }, [shareUrl]);

  useEffect(() => {
    onSessionNameChange?.(state?.name ?? null);
  }, [state?.name, onSessionNameChange]);

  useEffect(() => () => onSessionNameChange?.(null), [onSessionNameChange]);

  const connectedParticipantIds = useMemo(
    () =>
      new Set(
        (state?.participants ?? [])
          .filter((participant) => participant.isConnected)
          .map((participant) => participant.id),
      ),
    [state],
  );

  const isOwner =
    state !== null && state.ownerId === connection.participantId;

  const issuedToken = connection.token;

  useEffect(() => {
    if (issuedToken === null) return;
    writeStoredToken(roomId, issuedToken);
  }, [issuedToken, roomId]);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <>
      {errorCode !== null && (
        <p
          className="mx-4 mb-3 rounded-2xl bg-primary/10 px-3.5 py-2 text-[13px] font-semibold text-primary"
          role="alert"
        >
          {translate(`errors.${errorCode}`)}
        </p>
      )}

      {wasRemoved ? (
        <div className="mx-4 mt-6 mb-4 rounded-3xl border border-line bg-paper-raised p-6 text-center">
          <p className="m-0 font-display text-[17px] font-bold text-ink">
            {translate("errors.participant_removed")}
          </p>
          <p className="mt-2 mb-0 text-[13px] text-ink-dim">
            {translate("room.removedHint")}
          </p>
        </div>
      ) : state === null || draftName === null ? (
        <NameGate onJoin={join} suggestedName={suggestedName} translate={translate} />
      ) : (
        <>
          <RoomBoard
            copied={copied}
            myParticipantId={connection.participantId}
            onCopyLink={handleCopyLink}
            onDeleteRoom={handleDeleteRoom}
            onNextRound={handleNextRound}
            onRemoveParticipant={handleRemoveParticipant}
            onRename={handleRename}
            onResetRound={handleResetRound}
            onReveal={handleReveal}
            onSetDeck={handleSetDeck}
            onSetRole={handleSetRole}
            onSetRoomName={handleSetRoomName}
            onTransferOwnership={handleTransferOwnership}
            shareUrl={shareUrl}
            state={state}
            translate={translate}
          />

          <Hanko
            myParticipantId={connection.participantId}
            onVote={handleVote}
            state={state}
            translate={translate}
          />

          <ChatPanel
            connectedParticipantIds={connectedParticipantIds}
            isOwner={isOwner}
            messages={messages}
            myParticipantId={connection.participantId}
            onClear={handleClearMessages}
            onSend={handleSendMessage}
            translate={translate}
          />
        </>
      )}
    </>
  );
}