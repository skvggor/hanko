import { describe, expect, it, vi } from "vitest";
import {
  SUPPORTED_LOCALES,
  pickLocale,
  readStoredLocale,
  writeStoredLocale,
} from "@application/localePreference";

function stubStorage(getItem: (key: string) => string | null, setItem = vi.fn()) {
  vi.stubGlobal("localStorage", { getItem, setItem });
  return setItem;
}

describe("readStoredLocale", () => {
  it("reads a stored locale", () => {
    stubStorage(() => "pt-BR");
    expect(readStoredLocale()).toBe("pt-BR");
  });

  it("ignores an unknown stored value", () => {
    stubStorage(() => "ja-JP");
    expect(readStoredLocale()).toBeNull();
  });

  it("ignores an empty stored value", () => {
    stubStorage(() => "");
    expect(readStoredLocale()).toBeNull();
  });

  it("survives storage being unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("denied");
      },
    });
    expect(readStoredLocale()).toBeNull();
  });
});

describe("writeStoredLocale", () => {
  it("stores the choice", () => {
    const setItem = stubStorage(() => null);
    writeStoredLocale("pt-BR");
    expect(setItem).toHaveBeenCalledWith("hanko:locale", "pt-BR");
  });

  it("survives storage being unavailable", () => {
    vi.stubGlobal("localStorage", {
      setItem() {
        throw new Error("denied");
      },
    });
    expect(() => writeStoredLocale("en-US")).not.toThrow();
  });
});

describe("pickLocale", () => {
  it("prefers the stored choice over the browser", () => {
    expect(pickLocale("pt-BR", "en-US", "en-US")).toBe("pt-BR");
  });

  it("falls back to the browser language", () => {
    expect(pickLocale(null, "pt-BR", "en-US")).toBe("pt-BR");
  });

  it("matches the browser language loosely", () => {
    expect(pickLocale(null, "pt", "en-US")).toBe("pt-BR");
    expect(pickLocale(null, "pt-PT", "en-US")).toBe("pt-BR");
    expect(pickLocale(null, "en-GB", "pt-BR")).toBe("en-US");
  });

  it("is case insensitive", () => {
    expect(pickLocale(null, "PT-br", "en-US")).toBe("pt-BR");
  });

  it("falls back for an unsupported language", () => {
    expect(pickLocale(null, "ja-JP", "en-US")).toBe("en-US");
  });

  it("falls back when the browser says nothing", () => {
    expect(pickLocale(null, undefined, "en-US")).toBe("en-US");
  });
});

describe("SUPPORTED_LOCALES", () => {
  it("ships english and portuguese", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en-US", "pt-BR"]);
  });
});