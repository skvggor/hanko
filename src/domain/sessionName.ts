export const SESSION_NAME_MAX_LENGTH = 60;

export type SessionNameValidation =
  | { valid: true; name: string }
  | { valid: false; reason: "empty" | "too_long" | "invalid_characters" };

/**
 * Control and format characters are refused rather than stripped: a zero width
 * space in a room title is invisible to the reader but still there.
 */
const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/u;

export function normalizeSessionName(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/gu, " ");
}

export function validateSessionName(raw: string): SessionNameValidation {
  const name = normalizeSessionName(raw);

  if (name.length === 0) {
    return { valid: false, reason: "empty" };
  }

  if (name.length > SESSION_NAME_MAX_LENGTH) {
    return { valid: false, reason: "too_long" };
  }

  if (CONTROL_OR_FORMAT.test(name)) {
    return { valid: false, reason: "invalid_characters" };
  }

  return { valid: true, name };
}

export function isValidSessionName(raw: string): boolean {
  return validateSessionName(raw).valid;
}