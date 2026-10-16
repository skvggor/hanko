import type { RefObject } from "react";
import { splitChatText, type ChatMessage } from "@domain/chat";
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
          const segments = splitChatText(message.text);
          const hasAddress = segments.some((segment) => segment.kind === "link");

          return (
            <p
              className="chat-line"
              data-mine={isMine}
              data-left={hasLeft}
              key={message.id}
            >
              <span className="chat-line__name">{message.authorName}</span>
              <span className="chat-line__text">
                {segments.map((segment, index) =>
                  segment.kind === "link" ? (
                    <a
                      className="chat-line__link"
                      href={segment.href}
                      key={`${message.id}-link-${index}`}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {segment.href}
                    </a>
                  ) : (
                    <span key={`${message.id}-text-${index}`}>{segment.text}</span>
                  ),
                )}

                {/*
                 * The note sits outside the anchor so the link's own name stays exactly
                 * the address, which is what somebody repeating it out loud needs, while
                 * a screen reader still meets the note as the next thing in the line.
                 */}
                {hasAddress && (
                  <span className="visually-hidden">
                    {translate("chat.opensInNewTab")}
                  </span>
                )}
              </span>
            </p>
          );
        })
      )}
    </div>
  );
}