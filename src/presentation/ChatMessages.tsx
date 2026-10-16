import type { RefObject } from "react";
import type { ChatMessage } from "@domain/chat";
import type { Translator } from "@application/i18n";

export interface ChatMessagesProps {
  messages: ChatMessage[];
  myParticipantId: string | null;
  connectedParticipantIds: ReadonlySet<string>;
  /** Extra class for the panel that hosts the list, which lays it out differently. */
  className?: string;
  listRef?: RefObject<HTMLDivElement | null>;
  translate: Translator;
}

/**
 * The conversation as a list, which is the only shape in which it can be read back.
 * The cats carry one message each, so everything said earlier than that has nowhere
 * else to be seen; this is where it lives, and the panel on a wide screen and the
 * dock on a narrow one are the same list underneath.
 *
 * It is a live region, because a message that arrives while somebody is reading is
 * the one they need to hear. That is only worth it while the list is on screen: a
 * panel nobody is looking at would otherwise re-announce the backlog on every change.
 */
export function ChatMessages({
  messages,
  myParticipantId,
  connectedParticipantIds,
  className = "",
  listRef,
  translate,
}: Readonly<ChatMessagesProps>) {
  return (
    <div className={className} ref={listRef} role="log">
      {messages.length === 0 ? (
        <p className="chat-panel__empty">{translate("chat.empty")}</p>
      ) : (
        messages.map((message) => {
          const isMine = message.authorId === myParticipantId;
          const hasLeft = !connectedParticipantIds.has(message.authorId);

          return (
            <p
              className="chat-line"
              data-mine={isMine}
              data-left={hasLeft}
              key={message.id}
            >
              <span className="chat-line__name">{message.authorName}</span>
              <span className="chat-line__text">{message.text}</span>
            </p>
          );
        })
      )}
    </div>
  );
}