import { ArrowUpIcon, TrashIcon } from "@phosphor-icons/react";
import { MESSAGE_MAX_LENGTH } from "@domain/chat";
import type { Translator } from "@application/i18n";
import { Tooltip } from "@presentation/ui";
import { useMessageDraft } from "@presentation/useMessageDraft";

export interface CatComposerProps {
  hasMessages: boolean;
  isOwner: boolean;
  onClear: () => void;
  onSend: (text: string) => void;
  translate: Translator;
}

export function CatComposer({
  hasMessages,
  isOwner,
  onClear,
  onSend,
  translate,
}: Readonly<CatComposerProps>) {
  const { canSend, draft, setDraft, submit } = useMessageDraft(onSend);

  return (
    <form
      aria-label={translate("chat.title")}
      className="cat-composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="visually-hidden" htmlFor="cat-composer-input">
        {translate("chat.placeholder")}
      </label>
      <input
        autoComplete="off"
        className="cat-composer__input"
        id="cat-composer-input"
        maxLength={MESSAGE_MAX_LENGTH}
        placeholder={translate("chat.placeholder")}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />

      <button
        aria-label={translate("chat.send")}
        className="cat-composer__send"
        disabled={!canSend}
        type="submit"
      >
        <ArrowUpIcon aria-hidden="true" size={16} weight="bold" />
      </button>

      {isOwner && hasMessages && (
        /*
         * The one icon in this room that was drawn bare. A bin says what it throws
         * away and nothing about how far that reaches, and this one takes the whole
         * conversation out from under everybody at once. The tooltip carries the same
         * sentence as the name, because a tooltip is drawn and not announced, so
         * splitting them would leave the sentence nobody can hear.
         */
        <Tooltip label={translate("chat.clear")}>
          <button
            aria-label={translate("chat.clear")}
            className="cat-composer__clear"
            type="button"
            onClick={onClear}
          >
            <TrashIcon aria-hidden="true" size={15} weight="bold" />
          </button>
        </Tooltip>
      )}
    </form>
  );
}
