import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMessageDraft } from "@presentation/useMessageDraft";

describe("useMessageDraft", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useMessageDraft(vi.fn()));

    expect(result.current.draft).toBe("");
  });

  it("sends what was typed", () => {
    const onSend = vi.fn();
    const { result } = renderHook(() => useMessageDraft(onSend));

    act(() => result.current.setDraft("vamos nessa"));
    act(() => result.current.submit());

    expect(onSend).toHaveBeenCalledWith("vamos nessa");
  });

  it("trims the message before sending it", () => {
    const onSend = vi.fn();
    const { result } = renderHook(() => useMessageDraft(onSend));

    act(() => result.current.setDraft("  vamos nessa \n"));
    act(() => result.current.submit());

    expect(onSend).toHaveBeenCalledWith("vamos nessa");
  });

  /**
   * The room refuses an empty message with an error frame, so the composer must not
   * spend a round trip on whitespace and then present the refusal as if the person
   * had typed something wrong.
   */
  it("refuses to send nothing at all", () => {
    const onSend = vi.fn();
    const { result } = renderHook(() => useMessageDraft(onSend));

    act(() => result.current.setDraft("    "));
    act(() => result.current.submit());

    expect(onSend).not.toHaveBeenCalled();
  });

  it("keeps what was typed after a refused send", () => {
    const onSend = vi.fn();
    const { result } = renderHook(() => useMessageDraft(onSend));

    act(() => result.current.setDraft("   "));
    act(() => result.current.submit());

    expect(result.current.draft).toBe("   ");
  });

  it("empties itself once the message is away", () => {
    const onSend = vi.fn();
    const { result } = renderHook(() => useMessageDraft(onSend));

    act(() => result.current.setDraft("vamos nessa"));
    act(() => result.current.submit());

    expect(result.current.draft).toBe("");
  });

  it("says whether there is anything worth sending", () => {
    const { result } = renderHook(() => useMessageDraft(vi.fn()));

    expect(result.current.canSend).toBe(false);

    act(() => result.current.setDraft("oi"));
    expect(result.current.canSend).toBe(true);

    act(() => result.current.setDraft("   "));
    expect(result.current.canSend).toBe(false);
  });
});