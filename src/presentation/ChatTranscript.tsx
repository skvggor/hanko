import { useCallback, useEffect, useRef, useState } from "react";
import { ChatsCircleIcon, XIcon } from "@phosphor-icons/react";
import type { ChatMessage } from "@domain/chat";
import type { Translator } from "@application/i18n";
import { ChatMessages } from "@presentation/ChatMessages";

const WARNING_KEY = "hanko:chat-warning";

export interface ChatTranscriptProps {
  messages: ChatMessage[];
  myParticipantId: string | null;
  connectedParticipantIds: ReadonlySet<string>;
  translate: Translator;
}

/**
 * The conversation in the ordinary way: a list you can read back, rather than one
 * message per cat. On a wide screen the bubbles are the ambient layer and this is
 * where the room actually gets read, which is why it is opened rather than always
 * there. The bubbles cannot do this job, because each carries a single message and
 * everything said before that has nowhere else to be seen.
 *
 * The composer is not here. Speaking is always available; only reading is something
 * a person asks for, and folding the composer into this panel would take the only way
 * of answering away whenever the panel is closed.
 */
export function ChatTranscript({
  messages,
  myParticipantId,
  connectedParticipantIds,
  translate,
}: Readonly<ChatTranscriptProps>) {
  const [open, setOpen] = useState(false);
  const [showWarning, setShowWarning] = useState(() => !readWarningSeen());
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || listRef.current === null) return;

    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, open]);

  /**
   * The room id is the only secret there is, there are no accounts and nothing here
   * is encrypted, so the warning states what is true about the room instead of
   * describing a liability nobody here is in a position to accept. It is shown once
   * and remembered, because a notice that returns at every opening stops being read
   * the moment it becomes furniture.
   */
  const dismissWarning = useCallback(() => {
    try {
      globalThis.localStorage?.setItem(WARNING_KEY, "read");
    } catch {
      // Storage can be denied, and then the warning returns, which is the safe way
      // round to be wrong.
    }

    setShowWarning(false);
  }, []);

  if (!open) {
    return (
      <>
        <button
          aria-label={translate("chat.read")}
          className="chat-transcript__open"
          type="button"
          onClick={() => setOpen(true)}
        >
          <ChatsCircleIcon aria-hidden="true" size={15} weight="bold" />
          <span>{translate("chat.read")}</span>
        </button>

        {/*
          Closed, the list is not on screen, so it cannot be the live region. The
          newest message is announced on its own instead: a region holding the whole
          backlog would be read again from the start on every change.
        */}
        {messages.length > 0 && (
          <div aria-live="polite" className="visually-hidden" role="log">
            {`${messages.at(-1)?.authorName ?? ""}: ${messages.at(-1)?.text ?? ""}`}
          </div>
        )}
      </>
    );
  }

  return (
    <section
      aria-label={translate("chat.title")}
      className="chat-transcript"
      data-open="true"
    >
      <header className="chat-transcript__header">
        <h2 className="chat-transcript__heading">{translate("chat.read")}</h2>
        <button
          aria-label={translate("chat.close")}
          className="chat-transcript__close"
          type="button"
          onClick={() => setOpen(false)}
        >
          <XIcon aria-hidden="true" size={15} weight="bold" />
        </button>
      </header>

      {showWarning && (
        <p
          aria-live="polite"
          className="chat-transcript__warning"
          data-role="warning"
          role="note"
        >
          <span>{translate("chat.warning")}</span>
          <button
            className="chat-transcript__warning-dismiss"
            type="button"
            onClick={dismissWarning}
          >
            {translate("chat.warningDismiss")}
          </button>
        </p>
      )}

      <ChatMessages
        className="chat-transcript__list"
        connectedParticipantIds={connectedParticipantIds}
        listRef={listRef}
        messages={messages}
        myParticipantId={myParticipantId}
        translate={translate}
      />
    </section>
  );
}

function readWarningSeen(): boolean {
  try {
    return globalThis.localStorage?.getItem(WARNING_KEY) === "read";
  } catch {
    return false;
  }
}