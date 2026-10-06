import type { Locale } from "@application/i18n";

const LOCALE_KEY = "hanko:locale";

export const SUPPORTED_LOCALES: Locale[] = ["en-US", "pt-BR"];

export function readStoredLocale(): Locale | null {
  try {
    const stored = globalThis.localStorage?.getItem(LOCALE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeStoredLocale(locale: Locale): void {
  try {
    globalThis.localStorage?.setItem(LOCALE_KEY, locale);
  } catch {
    // storage unavailable, the choice just will not survive a reload
  }
}

function isLocale(value: string | null | undefined): value is Locale {
  return value !== null && value !== undefined && SUPPORTED_LOCALES.includes(value as Locale);
}

/**
 * What to show on first paint: the stored choice wins, then the browser language,
 * then english. The stored value is a deliberate choice, so it outranks the browser.
 */
export function pickLocale(
  stored: Locale | null,
  browserLanguage: string | undefined,
  fallback: Locale,
): Locale {
  if (stored !== null) return stored;
  if (browserLanguage === undefined) return fallback;

  const exact = SUPPORTED_LOCALES.find(
    (locale) => locale.toLowerCase() === browserLanguage.toLowerCase(),
  );

  if (exact !== undefined) return exact;

  const language = (browserLanguage.split("-")[0] ?? "").toLowerCase();
  const partial = SUPPORTED_LOCALES.find(
    (locale) => (locale.split("-")[0] ?? "").toLowerCase() === language,
  );

  return partial ?? fallback;
}