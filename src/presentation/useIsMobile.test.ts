import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useIsMobile } from "@presentation/useIsMobile";

interface FakeQuery extends MediaQueryList {
  trigger(matches: boolean): void;
}

function createQuery(initial: boolean): FakeQuery {
  const listeners: (() => void)[] = [];
  const query = {
    matches: initial,
    trigger(next: boolean) {
      query.matches = next;
      listeners.forEach((listener) => listener());
    },
    addEventListener(_event: string, listener: () => void) {
      listeners.push(listener);
    },
    removeEventListener: vi.fn(),
  };
  return query as unknown as FakeQuery;
}

function stubMatchMedia(initial: boolean): FakeQuery {
  const query = createQuery(initial);
  vi.stubGlobal("matchMedia", () => query);
  return query;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useIsMobile", () => {
  it("returns false on a non-touch device", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
  });

  it("returns true on a touch device", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it("updates when the match media changes", () => {
    const query = stubMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);

    act(() => query.trigger(true));

    expect(result.current).toBe(true);
  });
});
