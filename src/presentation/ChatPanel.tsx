import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ChatsCircle,
  Minus,
  Trash,
} from "@phosphor-icons/react";
import { MESSAGE_MAX_LENGTH, type ChatMessage } from "@domain/chat";
import type { Translator } from "@application/i18n";

const WIDE_QUERY = "(min-width: 640px)";

function prefersWideScreen(): boolean {
  return globalThis.matchMedia?.(WIDE_QUERY).matches ?? false;
}

export interface ChatPanelProps {
  messages: ChatMessage[];
  myParticipantId: string | null;
  connectedParticipantIds: ReadonlySet<string>;
  isOwner: boolean;
  onClear: () => void;
  onSend: (text: string) => void;
  translate: Translator;
}

export function ChatPanel({
  messages,
  myParticipantId,
  connectedParticipantIds,
  isOwner,
  onClear,
  onSend,
  translate,
}: ChatPanelProps) {
  const [open, setOpen] = useState(prefersWideScreen);
  const [draft, setDraft] = useState("");
  const [readUpTo, setReadUpTo] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const unread = readUpTo === null ? 0 : Math.max(0, messages.length - readUpTo);

  const openLabel =
    unread > 0
      ? translate("chat.openUnread", { count: unread })
      : translate("chat.open");

  const openPanel = useCallback(() => {
    setOpen(true);
    setReadUpTo(null);
  }, []);

  const minimizePanel = useCallback(() => {
    setOpen(false);
    setReadUpTo(messages.length);
  }, [messages.length]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (list !== null) list.scrollTop = list.scrollHeight;
  }, [open, messages.length]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (text.length === 0) return;
    onSend(text);
    setDraft("");
  }, [draft, onSend]);

  if (!open) {
    return (
      <div className="chat-dock" data-open="false">
        <button
          aria-label={openLabel}
          className="chat-launcher"
          type="button"
          onClick={openPanel}
        >
          <ChatsCircle aria-hidden="true" size={22} weight="fill" />
          {unread > 0 && (
            <span className="chat-launcher__badge">{unread > 9 ? "9+" : unread}</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="chat-dock" data-open="true">
      <section aria-label={translate("chat.title")} className="chat-panel">
        <header className="chat-panel__header">
          <h2 className="flex items-center gap-tight font-display text-[0.8125rem] font-bold text-ink">
            <ChatsCircle aria-hidden="true" size={16} weight="fill" />
            {translate("chat.title")}
          </h2>

          <div className="flex items-center gap-1">
            {isOwner && messages.length > 0 && (
              <button
                aria-label={translate("chat.clear")}
                className="chat-icon"
                type="button"
                onClick={onClear}
              >
                <Trash aria-hidden="true" size={15} weight="bold" />
              </button>
            )}
            <button
              aria-label={translate("chat.minimize")}
              className="chat-icon"
              type="button"
              onClick={minimizePanel}
            >
              <Minus aria-hidden="true" size={15} weight="bold" />
            </button>
          </div>
        </header>

        <div className="chat-panel__list" ref={listRef} role="log">
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

        <form
          className="chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className="sr-only" htmlFor="chat-input">
            {translate("chat.placeholder")}
          </label>
          <input
            autoComplete="off"
            className="chat-input"
            id="chat-input"
            maxLength={MESSAGE_MAX_LENGTH}
            placeholder={translate("chat.placeholder")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            aria-label={translate("chat.send")}
            className="chat-send"
            disabled={draft.trim().length === 0}
            type="submit"
          >
            <ArrowUp aria-hidden="true" size={16} weight="bold" />
          </button>
        </form>
      </section>
    </div>
  );
}