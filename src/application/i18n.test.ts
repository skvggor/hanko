import { describe, expect, it } from "vitest";
import enUS from "../../locales/en-US/translations.json";
import ptBR from "../../locales/pt-BR/translations.json";
import {
  DEFAULT_LOCALE,
  LOCALES,
  createTranslator,
  resolveLocale,
  translate,
} from "@application/i18n";

describe("LOCALES", () => {
  it("exposes english and portuguese", () => {
    expect(LOCALES).toEqual(["en-US", "pt-BR"]);
  });

  it("defaults to english", () => {
    expect(DEFAULT_LOCALE).toBe("en-US");
  });
});

describe("resolveLocale", () => {
  it("returns exact matches", () => {
    expect(resolveLocale("pt-BR")).toBe("pt-BR");
    expect(resolveLocale("en-US")).toBe("en-US");
  });

  it("matches on language when the region differs", () => {
    expect(resolveLocale("pt")).toBe("pt-BR");
    expect(resolveLocale("pt-PT")).toBe("pt-BR");
    expect(resolveLocale("en")).toBe("en-US");
    expect(resolveLocale("en-GB")).toBe("en-US");
  });

  it("falls back to english for unknown languages", () => {
    expect(resolveLocale("ja-JP")).toBe("en-US");
    expect(resolveLocale("de-DE")).toBe("en-US");
  });

  it("falls back to english when there is no preference", () => {
    expect(resolveLocale(undefined)).toBe("en-US");
  });

  it("falls back to english for an empty string", () => {
    expect(resolveLocale("")).toBe("en-US");
  });

  it("does not resolve inherited object properties", () => {
    expect(resolveLocale("constructor")).toBe("en-US");
    expect(resolveLocale("toString")).toBe("en-US");
  });
});

describe("translate", () => {
  it("translates a simple key", () => {
    expect(translate("en-US", "controls.reveal")).toBe("Reveal");
    expect(translate("pt-BR", "controls.reveal")).toBe("Revelar");
  });

  it("interpolates variables", () => {
    expect(translate("en-US", "room.round", { round: 3 })).toBe("Round 3");
    expect(translate("pt-BR", "room.round", { round: 3 })).toBe("Rodada 3");
  });

  it("interpolates several variables", () => {
    expect(translate("pt-BR", "room.waitingHint", { link: "hanko.app/x" })).toBe(
      "Compartilhe este link: hanko.app/x",
    );
  });

  it("keeps the placeholder when the variable is missing", () => {
    expect(translate("en-US", "room.round")).toBe("Round {{round}}");
  });

  it("stringifies numeric variables", () => {
    expect(translate("en-US", "room.totalPoints", { total: 21 })).toBe("21 points");
  });

  it("returns the path when the key is missing", () => {
    expect(translate("en-US", "does.not.exist")).toBe("does.not.exist");
  });

  it("returns the path when a leaf resolves to an object", () => {
    expect(translate("en-US", "controls.deck")).toBe("controls.deck");
  });

  it("does not walk into inherited properties", () => {
    expect(translate("en-US", "constructor.prototype")).toBe("constructor.prototype");
  });
});

describe("createTranslator", () => {
  it("binds a locale", () => {
    const translatePortuguese = createTranslator("pt-BR");
    expect(translatePortuguese("vote.prompt")).toBe("Sua estimativa");
  });

  it("still accepts variables", () => {
    const translatePortuguese = createTranslator("pt-BR");
    expect(translatePortuguese("room.connected", { count: 3 })).toBe("3 presentes");
  });

  it("defaults variables to an empty map", () => {
    const translateEnglish = createTranslator("en-US");
    expect(translateEnglish("room.waiting")).toBe("Waiting for people to join");
  });
});
describe("placeholder hygiene", () => {
  it("uses double braces for every variable", () => {
    const walk = (node: unknown, path: string): Array<[string, string]> => {
      if (typeof node === "string") {
        return [[path, node]];
      }

      if (typeof node !== "object" || node === null) return [];

      return Object.entries(node).flatMap(([key, value]) =>
        walk(value, path === "" ? key : `${path}.${key}`),
      );
    };

    const offenders: string[] = [];

    for (const dictionary of [enUS, ptBR]) {
      for (const [path, value] of walk(dictionary, "")) {
        const stripped = value.replaceAll("{{", "").replaceAll("}}", "");
        if (stripped.includes("{") || stripped.includes("}")) offenders.push(path);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps variable names identical across locales", () => {
    const variablesOf = (node: unknown): string[] => {
      if (typeof node === "string") {
        return [...node.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? "");
      }

      if (typeof node !== "object" || node === null) return [];

      return Object.values(node).flatMap(variablesOf);
    };

    expect(variablesOf(ptBR).sort()).toEqual(variablesOf(enUS).sort());
  });
});
