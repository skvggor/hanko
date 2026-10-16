import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { CatState } from "@domain/cat";
import { useControlledCat } from "@presentation/useControlledCat";

const bounds = { width: 800, height: 600 };
const catSize = 64;

function cat(overrides: Partial<CatState> = {}): CatState {
  return {
    participantId: "p2",
    breed: "tabby",
    x: 0.9,
    y: 0.9,
    direction: "right",
    activity: "idle",
    isPaused: false,
    ...overrides,
  };
}

function controlled(
  options: Partial<Parameters<typeof useControlledCat>[0]> = {},
) {
  return renderHook(() =>
    useControlledCat({ asleep: false, bounds, catSize, cats: [], ...options }),
  );
}

describe("useControlledCat", () => {
  it("starts with no cat under control", () => {
    const { result } = controlled();

    expect(result.current.controlledId).toBeNull();
    expect(result.current.controlledPosition).toBeNull();
  });

  it("takes hold of the cat that was clicked", () => {
    const { result } = controlled();

    act(() => result.current.requestControl("p1", { x: 10, y: 20 }));

    expect(result.current.controlledId).toBe("p1");
    expect(result.current.controlledPosition).toEqual({ x: 10, y: 20 });
  });

  it("walks while it moves and settles when it stops", async () => {
    vi.useFakeTimers();
    try {
      const { result } = controlled();
      act(() => result.current.requestControl("p1", { x: 10, y: 20 }));

      act(() => result.current.moveControlled(0, 10));
      expect(result.current.activity).toBe("walking");

      await act(() => vi.advanceTimersByTime(560));
      expect(result.current.activity).toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("turns to face the way it moved", () => {
    const { result } = controlled();
    act(() => result.current.requestControl("p1", { x: 10, y: 20 }));

    act(() => result.current.moveControlled(-10, 0));
    expect(result.current.controlledDirection).toBe("left");

    act(() => result.current.moveControlled(10, 0));
    expect(result.current.controlledDirection).toBe("right");
  });

  it("stops at the edge instead of walking off the screen", () => {
    const { result } = controlled();
    act(() => result.current.requestControl("p1", { x: 790, y: 590 }));

    act(() => result.current.moveControlled(100, 100));

    expect(result.current.controlledPosition).toEqual({
      x: bounds.width - catSize,
      y: bounds.height - catSize,
    });
  });

  it("ignores the keyboard while asleep", () => {
    const { result } = controlled({ asleep: true });
    act(() => result.current.requestControl("p1", { x: 10, y: 20 }));

    act(() => result.current.moveControlled(0, 10));

    expect(result.current.controlledPosition).toEqual({ x: 10, y: 20 });
  });

  it("jumps and comes back down", async () => {
    vi.useFakeTimers();
    try {
      const { result } = controlled();

      act(() => result.current.triggerJump());
      expect(result.current.activity).toBe("jumping");

      await act(() => vi.advanceTimersByTime(450));
      expect(result.current.activity).toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reacts to being walked into by another cat", () => {
    const { result } = controlled({ cats: [cat({ x: 0.02, y: 0.04 })] });
    act(() => result.current.requestControl("p1", { x: 16, y: 24 }));

    act(() => result.current.moveControlled(0, 0));

    expect(result.current.activity).toBe("angry");
  });

  it("forgives being bumped and carries on being driven", async () => {
    vi.useFakeTimers();
    try {
      const { result } = controlled({ cats: [cat({ x: 0.02, y: 0.04 })] });
      act(() => result.current.requestControl("p1", { x: 16, y: 24 }));

      act(() => result.current.moveControlled(0, 0));
      expect(result.current.activity).toBe("angry");

      await act(() => vi.advanceTimersByTime(1_200));
      act(() => result.current.moveControlled(0, 10));
      expect(result.current.controlledPosition?.y).toBe(34);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets go when released", () => {
    const { result } = controlled();
    act(() => result.current.requestControl("p1", { x: 10, y: 20 }));

    act(() => result.current.releaseControl());

    expect(result.current.controlledId).toBeNull();
  });

  it("starts facing right when it takes hold of a cat", () => {
    const { result } = controlled();
    act(() => result.current.requestControl("p1", { x: 10, y: 20 }));
    act(() => result.current.moveControlled(-10, 0));

    act(() => result.current.requestControl("p2", { x: 0, y: 0 }));

    expect(result.current.controlledDirection).toBe("right");
  });
});
describe("useControlledCat and what the room hears about", () => {
  /**
   * The room only needs to hear about a cat somebody is actually driving. Publishing
   * the spot a cat was placed at would drag everyone else's view of it back to
   * wherever it was last seen, for no reason.
   */
  it("has not moved a cat that was only just taken hold of", () => {
    const { result } = controlled();

    act(() => result.current.requestControl("p1", { x: 10, y: 20 }));

    expect(result.current.hasMoved).toBe(false);
  });

  it("has moved once the person drives it", () => {
    const { result } = controlled();
    act(() => result.current.requestControl("p1", { x: 10, y: 20 }));

    act(() => result.current.moveControlled(0, 10));

    expect(result.current.hasMoved).toBe(true);
  });

  it("has moved after a jump, which is a move too", () => {
    const { result } = controlled();
    act(() => result.current.requestControl("p1", { x: 10, y: 20 }));

    act(() => result.current.triggerJump());

    expect(result.current.hasMoved).toBe(true);
  });

  it("starts again when another cat is taken hold of", () => {
    const { result } = controlled();
    act(() => result.current.requestControl("p1", { x: 10, y: 20 }));
    act(() => result.current.moveControlled(0, 10));

    act(() => result.current.requestControl("p2", { x: 0, y: 0 }));

    expect(result.current.hasMoved).toBe(false);
  });

  it("starts again after being let go", () => {
    const { result } = controlled();
    act(() => result.current.requestControl("p1", { x: 10, y: 20 }));
    act(() => result.current.moveControlled(0, 10));

    act(() => result.current.releaseControl());
    act(() => result.current.requestControl("p1", { x: 0, y: 0 }));

    expect(result.current.hasMoved).toBe(false);
  });
});

describe("useControlledCat taking hold of a cat that is already standing", () => {
  it("keeps the way the cat was already facing", () => {
    const { result } = controlled();

    act(() => result.current.takeControl("p1", { x: 10, y: 20 }, "left"));

    expect(result.current.controlledDirection).toBe("left");
  });

  it("does not count as driven, because nobody drove it there", () => {
    const { result } = controlled();

    act(() => result.current.takeControl("p1", { x: 10, y: 20 }, "left"));

    expect(result.current.hasMoved).toBe(false);
  });

  it("does count as driven once the person moves it", () => {
    const { result } = controlled();
    act(() => result.current.takeControl("p1", { x: 10, y: 20 }, "left"));

    act(() => result.current.moveControlled(0, 10));

    expect(result.current.hasMoved).toBe(true);
  });
});
