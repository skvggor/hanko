import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAT_INACTIVITY_MS } from "@domain/cat";
import { useCat } from "@presentation/useCat";

describe("useCat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts walking and unpaused", () => {
    const { result } = renderHook(() =>
      useCat({ isControllable: true, participantId: "p1" }),
    );

    expect(result.current.activity).toBe("walking");
    expect(result.current.isPaused).toBe(false);
  });

  it("gives a deterministic duration per participant", () => {
    const { result: first } = renderHook(() =>
      useCat({ isControllable: true, participantId: "p1" }),
    );
    const { result: second } = renderHook(() =>
      useCat({ isControllable: true, participantId: "p1" }),
    );
    const { result: third } = renderHook(() =>
      useCat({ isControllable: true, participantId: "p2" }),
    );

    expect(first.current.durationSeconds).toBe(second.current.durationSeconds);
    expect(third.current.durationSeconds).not.toBe(first.current.durationSeconds);
  });

  it("toggles pause for a controllable cat", async () => {
    const { result } = renderHook(() =>
      useCat({ isControllable: true, participantId: "p1" }),
    );

    act(() => result.current.togglePause());

    expect(result.current.isPaused).toBe(true);
    expect(result.current.activity).toBe("idle");

    act(() => result.current.togglePause());

    expect(result.current.isPaused).toBe(false);
    expect(result.current.activity).toBe("walking");
  });

  it("ignores pause for a non-controllable cat", async () => {
    const { result } = renderHook(() =>
      useCat({ isControllable: false, participantId: "p1" }),
    );

    act(() => result.current.togglePause());

    expect(result.current.isPaused).toBe(false);
    expect(result.current.activity).toBe("walking");
  });

  it("sleeps after inactivity", async () => {
    const { result } = renderHook(() =>
      useCat({ isControllable: true, participantId: "p1" }),
    );

    await act(() => vi.advanceTimersByTime(CAT_INACTIVITY_MS));

    expect(result.current.activity).toBe("sleeping");
  });

  it("wakes on user activity and resets the sleep timer", async () => {
    const { result } = renderHook(() =>
      useCat({ isControllable: true, participantId: "p1" }),
    );

    await act(() => vi.advanceTimersByTime(CAT_INACTIVITY_MS - 1));
    await act(() => globalThis.dispatchEvent(new MouseEvent("mousemove")));
    await act(() => vi.advanceTimersByTime(1));

    expect(result.current.activity).toBe("walking");

    await act(() => vi.advanceTimersByTime(CAT_INACTIVITY_MS));

    expect(result.current.activity).toBe("sleeping");
  });

  it("jumps randomly while walking", async () => {
    const { result } = renderHook(() =>
      useCat({ isControllable: true, participantId: "p1", random: () => 0 }),
    );

    await act(() => vi.advanceTimersByTime(2_000));

    expect(result.current.activity).toBe("jumping");

    await act(() => vi.advanceTimersByTime(400));

    expect(result.current.activity).toBe("walking");
  });

  it("does not jump while paused", async () => {
    const { result } = renderHook(() =>
      useCat({ isControllable: true, participantId: "p1", random: () => 0 }),
    );

    act(() => result.current.togglePause());
    await act(() => vi.advanceTimersByTime(5_000));

    expect(result.current.activity).toBe("idle");
  });
});

describe("useCat under a busy pointer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** A real pointer advances the clock between events, which is what makes the
   * difference between a bail-out and a fresh value for React to compare. */
  async function move(times: number) {
    for (let index = 0; index < times; index += 1) {
      await act(async () => {
        vi.advanceTimersByTime(8);
        globalThis.dispatchEvent(new MouseEvent("mousemove"));
      });
    }
  }

  /**
   * A pointer can report well over a hundred events a second, and every one of them
   * landing as new state would re-render every cat in the room and rebuild the sleep
   * timer with it. The timer is measured in minutes, so a movement only has to be
   * noticed once per second to keep a cat awake for as long as the person is.
   */
  it("does not re-render for every pointer move", async () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useCat({ isControllable: true, participantId: "p1" });
    });

    const rendersBefore = renders;
    await move(50);

    expect(renders).toBe(rendersBefore);
    expect(result.current.activity).toBe("walking");
  });

  it("still keeps a cat awake while the pointer keeps moving", async () => {
    const { result } = renderHook(() =>
      useCat({ isControllable: true, participantId: "p1" }),
    );

    await act(() => vi.advanceTimersByTime(CAT_INACTIVITY_MS - 1));
    await move(50);
    // Read the clock while the pointer is still moving, not after it stops: the cat
    // is meant to fall asleep once the room goes quiet, and the throttle lets it
    // do so up to a second late.
    await act(() => vi.advanceTimersByTime(CAT_INACTIVITY_MS - 2_000));

    // Awake is the claim, not the exact pose: a cat mid-hop is still a cat that is
    // paying attention to the room.
    expect(result.current.activity).not.toBe("sleeping");
  });
});
