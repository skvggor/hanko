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