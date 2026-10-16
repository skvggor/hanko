import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useViewportSize } from "@presentation/useViewportSize";

function resizeTo(width: number, height: number): void {
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("innerHeight", height);
  act(() => {
    globalThis.window.dispatchEvent(new Event("resize"));
  });
}

describe("useViewportSize", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("measures the viewport as it is", () => {
    vi.stubGlobal("innerWidth", 1280);
    vi.stubGlobal("innerHeight", 720);

    const { result } = renderHook(() => useViewportSize());

    expect(result.current).toEqual({ width: 1280, height: 720 });
  });

  it("follows the viewport as it is resized", () => {
    vi.stubGlobal("innerWidth", 1280);
    vi.stubGlobal("innerHeight", 720);
    const { result } = renderHook(() => useViewportSize());

    resizeTo(640, 900);

    expect(result.current).toEqual({ width: 640, height: 900 });
  });

  it("stops listening once it is gone", () => {
    vi.stubGlobal("innerWidth", 1280);
    vi.stubGlobal("innerHeight", 720);
    const removeEventListener = vi.spyOn(globalThis.window, "removeEventListener");

    const { unmount } = renderHook(() => useViewportSize());
    unmount();

    expect(removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
  });

});