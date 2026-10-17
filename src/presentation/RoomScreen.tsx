import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MESSAGE_LIMIT, type ChatMessage } from "@domain/chat";
import type { PublicRoomState } from "@domain/protocol";
import type { DeckId } from "@domain/deck";
import type { ParticipantRole } from "@domain/room";
import type { CatActivity, CatState } from "@domain/cat";
import { RoomConnection, type ConnectionStatus } from "@application/roomConnection";
import type { Translator } from "@application/i18n";
import { roomPath } from "@application/routing";
import { CatOverlay } from "@presentation/CatOverlay";
import { ChatPanel } from "@presentation/ChatPanel";
import { BroomIcon } from "@phosphor-icons/react";
import { ConfirmDialog } from "@presentation/ConfirmDialog";
import { Tooltip } from "@presentation/ui";
import { Hanko } from "@presentation/Hanko";
import { NameGate } from "@presentation/NameGate";
import { RoomBoard } from "@presentation/RoomBoard";
import { useIsMobile } from "@presentation/useIsMobile";

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

/**
 * The clipboard is simply absent outside a secure context, even though the DOM
 * types promise it is always there. Going through a function keeps the possibility
 * in the type instead of letting a non-optional property hide a browser that has
 * not implemented it.
 */
function readClipboard(): Clipboard | undefined {
  return globalThis.navigator.clipboard;
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
  onRoomDeleted?: (errorCode: string) => void;
  translate: Translator;
}

export function RoomScreen({
  roomId,
  onSessionNameChange,
  onRoomDeleted,
  translate,
}: Readonly<RoomScreenProps>) {
  const [state, setState] = useState<PublicRoomState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [cats, setCats] = useState<CatState[]>([]);
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState<ParticipantRole>("voter");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [wasRemoved, setWasRemoved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connected");
  /** Waiting the round trip left a tap looking like it had done nothing. */
  const [pendingVote, setPendingVote] = useState<string | null | undefined>(undefined);
  const deleteTrigger = useRef<HTMLButtonElement>(null);

  const connection = useMemo(() => new RoomConnection(roomId), [roomId]);
  const storedToken = useMemo(() => readStoredToken(roomId), [roomId]);
  const suggestedName = useMemo(() => readStoredName(roomId), [roomId]);

  const shareUrl = useMemo(
    () => `${globalThis.location?.origin ?? ""}${roomPath(roomId)}`,
    [roomId],
  );

  useEffect(() => {
    const unsubscribeState = connection.subscribe((next) => {
      // The Durable Object queues messages, so the first state after a vote is its answer.
      setPendingVote(undefined);
      setState(next);
      setMessages(next.messages);
      setCats(next.cats ?? []);
    });
    const unsubscribeChat = connection.onChatMessage((message) => {
      setMessages((previous) => [...previous, message].slice(-MESSAGE_LIMIT));
    });
    const unsubscribeCatState = connection.onCatState((cat) => {
      setCats((previous) => {
        const index = previous.findIndex((entry) => entry.participantId === cat.participantId);
        if (index === -1) return [...previous, cat];
        const next = [...previous];
        next[index] = cat;
        return next;
      });
    });
    const unsubscribeError = connection.onError((code) => {
      setPendingVote(undefined);
      setErrorCode(code);
    });
    const unsubscribeDeleted = connection.onDeleted(() => {
      setConfirmingDelete(false);
      setErrorCode("room_deleted");
      onRoomDeleted?.("room_deleted");
    });
    const unsubscribeRemoved = connection.onRemoved(() => {
      setWasRemoved(true);
    });
    const unsubscribeConnection = connection.onConnectionChange((status) => {
      setConnectionStatus(status);
    });

    return () => {
      unsubscribeState();
      unsubscribeChat();
      unsubscribeCatState();
      unsubscribeError();
      unsubscribeDeleted();
      unsubscribeRemoved();
      unsubscribeConnection();
      connection.close();
    };
  }, [connection, onRoomDeleted]);

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
  const handleDeleteRoom = useCallback(() => {
    setConfirmingDelete(true);
  }, []);

  const confirmDelete = useCallback(() => {
    setConfirmingDelete(false);
    connection.deleteRoom();
  }, [connection]);

  const cancelDelete = useCallback(() => {
    setConfirmingDelete(false);
    deleteTrigger.current?.focus();
  }, []);
  const handleTransferOwnership = useCallback(
    (participantId: string) => connection.transferOwnership(participantId),
    [connection],
  );
  const handleRemoveParticipant = useCallback(
    (participantId: string) => connection.removeParticipant(participantId),
    [connection],
  );
  const handleRemoveCat = useCallback(() => connection.removeCat(), [connection]);

  /** Cat positions are normalised, so the room needs this window's shape to know where the edge is. */
  const handleShooCats = useCallback(
    () => connection.shooCats(globalThis.innerWidth / Math.max(1, globalThis.innerHeight)),
    [connection],
  );
  const handleSetRole = useCallback(
    (participantId: string, role: ParticipantRole) =>
      connection.setRole(participantId, role),
    [connection],
  );
  const handleRename = useCallback(
    (name: string) => {
      writeStoredName(roomId, name);
      connection.rename(name);
    },
    [connection, roomId],
  );
  const handleVote = useCallback(
    (value: string) => {
      const shown = pendingVote !== undefined ? pendingVote : (state?.myVote ?? null);
      setPendingVote(shown === value ? null : value);
      connection.vote(value);
    },
    [connection, pendingVote, state?.myVote],
  );
  const handleSetRoomName = useCallback(
    (name: string | null) => connection.setRoomName(name),
    [connection],
  );
  const handleSendMessage = useCallback(
    (text: string) => connection.sendMessage(text),
    [connection],
  );
  /** Asking, because this erases the room's conversation with no way back, like every other erasing control here. */
  const handleClearMessages = useCallback(() => setConfirmingClear(true), []);
  const confirmClearMessages = useCallback(() => {
    connection.clearMessages();
    setConfirmingClear(false);
  }, [connection]);
  const handleUpdateCat = useCallback(
    (update: {
      x: number;
      y: number;
      direction: "left" | "right";
      activity: CatActivity;
      isPaused: boolean;
    }) =>
      connection.updateCat(
        update.x,
        update.y,
        update.direction,
        update.activity,
        update.isPaused,
      ),
    [connection],
  );

  /**
   * The chip is the room's only secret, so claiming a copy that never happened is
   * the worst possible failure here: the person walks away believing the link is on
   * their clipboard when it is not. A clipboard that rejects, or a browser with no
   * clipboard at all, has to say so instead.
   */
  const handleCopyLink = useCallback(() => {
    const clipboard = readClipboard();

    if (clipboard === undefined) {
      setCopied(false);
      setErrorCode("copy_failed");
      return;
    }

    void clipboard.writeText(shareUrl).then(
      () => {
        setCopied(true);
        setErrorCode(null);
      },
      () => {
        setCopied(false);
        setErrorCode("copy_failed");
      },
    );
  }, [shareUrl]);

  useEffect(() => {
    onSessionNameChange?.(state?.name ?? null);
  }, [state?.name, onSessionNameChange]);

  useEffect(() => () => onSessionNameChange?.(null), [onSessionNameChange]);

  const isOwner =
    state !== null && state.ownerId === connection.participantId;

  /**
   * Counted from the room's list rather than from the last cat position: a cat whose
   * owner has just gone is still drawn on everybody else's screen, and only the room
   * knows it is gone.
   */
  const canShooCats =
    (state?.participants ?? []).filter(
      (participant) => participant.isConnected && participant.hasCat !== false,
    ).length > 1;

  const connectedParticipantIds = useMemo(
    () =>
      new Set(
        (state?.participants ?? [])
          .filter((participant) => participant.isConnected)
          .map((participant) => participant.id),
      ),
    [state],
  );

  const isMobile = useIsMobile();

  /**
   * The gate stays on screen until the room answers, so it has to say that it is waiting
   * rather than sitting there looking untouched. An error ends the wait, because the
   * person is being told the name was refused and the next thing they do is fix it.
   */
  const joining = draftName !== null && state === null && errorCode === null;

/**
 * Removal outranks everything, then there is no room to be in yet, and only after a name
 * has been sent and answered is there a board.
 */
  let body: ReactNode;

  if (wasRemoved) {
    body = (
      <div className="mt-stack mb-room rounded-3xl border border-line bg-paper-raised p-gutter text-center">
        <p className="m-0 font-display text-[1.0625rem] font-bold text-ink">
          {translate("errors.participant_removed")}
        </p>
        <p className="mt-snug mb-0 text-[0.8125rem] text-ink-dim">
          {translate("room.removedHint")}
        </p>
      </div>
    );
  } else if (state === null || draftName === null) {
    body = (
      <NameGate
        onJoin={join}
        pending={joining}
        suggestedName={suggestedName}
        translate={translate}
      />
    );
  } else {
    body = (
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
          deleteButtonRef={deleteTrigger}
          roomId={roomId}
          state={state}
          translate={translate}
        />

        <Hanko
          myParticipantId={connection.participantId}
          myVote={pendingVote !== undefined ? pendingVote : (state?.myVote ?? null)}
          onVote={handleVote}
          state={state}
          translate={translate}
        />

        {isMobile ? (
          <ChatPanel
            connectedParticipantIds={connectedParticipantIds}
            isOwner={isOwner}
            messages={messages}
            myParticipantId={connection.participantId}
            onClear={handleClearMessages}
            onSend={handleSendMessage}
            translate={translate}
          />
        ) : (
          <CatOverlay
            cats={cats}
            connectedParticipantIds={connectedParticipantIds}
            isOwner={isOwner}
            messages={messages}
            myParticipantId={connection.participantId}
            onClear={handleClearMessages}
            onRemoveCat={handleRemoveCat}
            onSend={handleSendMessage}
            onUpdateCat={handleUpdateCat}
            participants={state.participants}
            translate={translate}
          />
        )}
      </>
    );
  }

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
          className="mb-snug rounded-2xl bg-primary/10 px-snug py-tight text-[0.8125rem] font-semibold text-primary"
          role="alert"
        >
          {translate(`errors.${errorCode}`)}
        </p>
      )}

      {/*
        A dropped socket is not a lost seat, so the room stays on screen and the
        notice sits above it rather than replacing it. "status" rather than "alert"
        because nothing has gone wrong that the person can act on by reading this:
        it is the network talking, and interrupting whatever they were doing for it
        would be worse than the silence it replaces.
      */}
      {connectionStatus !== "connected" && (
        <output
          className="mb-snug flex items-center gap-tight rounded-2xl bg-ink/5 px-snug py-tight text-[0.8125rem] font-semibold text-ink-dim"
        >
          <span>
            {translate(
              connectionStatus === "offline" ? "room.offline" : "room.reconnecting",
            )}
          </span>

          {connectionStatus === "offline" && (
            <button
              className="ml-auto shrink-0 rounded-chip border border-line px-tight py-hair font-sans text-[0.71875rem] font-bold tracking-[0.06em] uppercase transition-colors hover:border-ink focus-visible:border-ink focus-visible:outline-offset-[3px]"
              type="button"
              onClick={() => connection.retry()}
            >
              {translate("errors.retry")}
            </button>
          )}
        </output>
      )}

      {/* Drawn by the room rather than the overlay, which a coarse pointer does not render at all. */}
      {canShooCats && (
        <Tooltip
          className="cat-shoo"
          label={translate("cat.shooAction")}
          placement="above-end"
        >
          <button
            aria-label={translate("cat.shooAction")}
            className="cat-shoo__button"
            type="button"
            onClick={handleShooCats}
          >
            <BroomIcon aria-hidden="true" size={18} weight="bold" />
          </button>
        </Tooltip>
      )}

      {body}

      {confirmingClear && (
        <ConfirmDialog
          acceptLabel={translate("chat.clearConfirmAccept")}
          body={translate("chat.clearConfirmBody")}
          cancelLabel={translate("chat.clearConfirmCancel")}
          title={translate("chat.clearConfirmTitle")}
          onAccept={confirmClearMessages}
          onCancel={() => setConfirmingClear(false)}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          acceptLabel={translate("controls.confirmDeleteAccept")}
          body={translate("controls.confirmDeleteBody")}
          cancelLabel={translate("controls.confirmDeleteCancel")}
          title={translate("controls.confirmDeleteTitle")}
          onAccept={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </>
  );
}
