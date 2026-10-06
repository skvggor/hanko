import enUS from "../../locales/en-US/translations.json";
import ptBR from "../../locales/pt-BR/translations.json";

export type Locale = "en-US" | "pt-BR";

export const LOCALES: Locale[] = ["en-US", "pt-BR"];

export const DEFAULT_LOCALE: Locale = "en-US";

const DICTIONARIES = {
  "en-US": enUS,
  "pt-BR": ptBR,
} satisfies Record<Locale, Record<string, unknown>>;

export type TranslationKey = Paths<typeof enUS>;

type Paths<T> = T extends string
  ? ""
  : {
      [K in keyof T & string]: T[K] extends string
        ? K
        : `${K}.${Paths<T[K]>}`;
    }[keyof T & string];

export function resolveLocale(candidate: string | undefined): Locale {
  if (candidate === undefined) return DEFAULT_LOCALE;
  if (Object.hasOwn(DICTIONARIES, candidate)) return candidate as Locale;

  const language = candidate.split("-")[0];
  const match = LOCALES.find((locale) => locale.split("-")[0] === language);
  return match ?? DEFAULT_LOCALE;
}

function lookup(dictionary: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((accumulator, segment) => {
    if (typeof accumulator !== "object" || accumulator === null) return undefined;
    return (accumulator as Record<string, unknown>)[segment];
  }, dictionary);
}

export function translate(
  locale: Locale,
  path: string,
  variables: Record<string, string | number> = {},
): string {
  const template = lookup(DICTIONARIES[locale], path);

  if (typeof template !== "string") return path;

  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const value = variables[name];
    return value === undefined ? match : String(value);
  });
}

export type Translator = (
  path: string,
  variables?: Record<string, string | number>,
) => string;

export function createTranslator(locale: Locale): Translator {
  return (path, variables) => translate(locale, path, variables);
}