import { useCallback, useMemo, useState } from "react";

export interface UseMessageDraftResult {
  draft: string;
  canSend: boolean;
  setDraft: (value: string) => void;
  submit: () => void;
}

/**
 * What a person has typed and how to hand it over. Shared by the two composers the
 * room can show, because the rules for turning a draft into a message are the same
 * in both and were written out twice: the room rejects an empty one with an error
 * frame, so whitespace is not sent and the refusal is never put in front of someone
 * who typed nothing.
 */
export function useMessageDraft(onSend: (text: string) => void): UseMessageDraftResult {
  const [draft, setDraft] = useState("");
  const canSend = draft.trim().length > 0;

  const submit = useCallback(() => {
    const text = draft.trim();
    if (text.length === 0) return;

    onSend(text);
    setDraft("");
  }, [draft, onSend]);

  return useMemo(
    () => ({ draft, canSend, setDraft, submit }),
    [draft, canSend, submit],
  );
}