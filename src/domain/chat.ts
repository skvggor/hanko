export const MESSAGE_MAX_LENGTH = 280;
export const MESSAGE_LIMIT = 100;

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  sentAt: number;
}

export function normalizeMessageText(text: string): string {
  return text.replace(/\s+/gu, " ").trim().slice(0, MESSAGE_MAX_LENGTH);
}

export function isSendableMessage(text: string): boolean {
  return normalizeMessageText(text).length > 0;
}

/**
 * One piece of a message: either words, or an address somebody can follow. The chat
 * is text from whoever is in the room, so this is what tells the view where a link
 * may begin. Everything else stays words.
 */
export type ChatSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "link"; readonly href: string };

/**
 * Only a real web address is linkified, and the scheme is part of the match on
 * purpose. Matching a bare shape such as a word followed by a dot would happily
 * produce a `javascript:` href out of a chat message, which is a hole in a page that
 * otherwise has no reason to trust anybody's text. Requiring the scheme means the
 * browser is never handed a link whose destination the reader did not type.
 */
const ADDRESS_PATTERN = /https?:\/\/[^\s<>"]+/giu;

/**
 * Sentence punctuation after an address belongs to the sentence. A bracket is only
 * dropped while the address holds more openings than closings, because an address can
 * legitimately end in one it opened itself, and mangling that is worse than carrying a
 * stray bracket.
 */
const SENTENCE_MARKS = ".,;:!?";

/**
 * Trimmed one character at a time on purpose. A pattern such as `[.,;:!?]+$` is shorter
 * and reads better, but it walks the run of marks more than once for every position it
 * tries, which is quadratic on a message that ends in a row of them, and a message is
 * text from whoever is in the room.
 */
function trimTrailingSentenceMarks(address: string): string {
  let end = address.length;

  while (end > 0 && SENTENCE_MARKS.includes(address[end - 1] ?? "")) end -= 1;

  return address.slice(0, end);
}

function trimTrailingPunctuation(address: string): string {
  const withoutSentenceMarks = trimTrailingSentenceMarks(address);
  let trimmed = withoutSentenceMarks;

  while (trimmed.endsWith(")") && countOf(trimmed, ")") > countOf(trimmed, "(")) {
    trimmed = trimmed.slice(0, -1);
  }

  return trimmed;
}

function countOf(value: string, character: string): number {
  let total = 0;

  for (const letter of value) {
    if (letter === character) total += 1;
  }

  return total;
}

export function splitChatText(text: string): ChatSegment[] {
  const segments: ChatSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(ADDRESS_PATTERN)) {
    const address = trimTrailingPunctuation(match[0]);

    if (address.length === 0) continue;

    const at = match.index;

    if (at > cursor) segments.push({ kind: "text", text: text.slice(cursor, at) });
    segments.push({ kind: "link", href: address });
    cursor = at + address.length;
  }

  if (cursor < text.length) segments.push({ kind: "text", text: text.slice(cursor) });

  return segments;
}

export function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ChatMessage>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.authorId === "string" &&
    typeof candidate.authorName === "string" &&
    typeof candidate.text === "string" &&
    typeof candidate.sentAt === "number"
  );
}