export const NAME_MAX_LENGTH = 24;

const LETTERS_AND_MARKS = /^[\p{L}\p{M}]+$/u;

export type NameValidationResult =
  | { valid: true; name: string }
  | { valid: false; reason: "empty" | "too_long" | "invalid_characters" };

export function normalizeName(rawName: string): string {
  return rawName.normalize("NFC").trim().replace(/\s+/gu, " ");
}

export function validateName(rawName: string): NameValidationResult {
  const name = normalizeName(rawName);

  if (name.length === 0) {
    return { valid: false, reason: "empty" };
  }

  if (name.length > NAME_MAX_LENGTH) {
    return { valid: false, reason: "too_long" };
  }

  if (LETTERS_AND_MARKS.test(name.replaceAll(" ", ""))) {
    return { valid: true, name };
  }

  return { valid: false, reason: "invalid_characters" };
}

export function isValidName(rawName: string): boolean {
  return validateName(rawName).valid;
}