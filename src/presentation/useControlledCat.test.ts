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
    useControlledCat({ asleep: false, bounds, catSize, cats: [], myParticipantId: null, ...options }),
  );
}

/**
 * The hook above closes over its options, so rerendering it changes nothing. Anything
 * that needs the room to change under the hook has to hand its options in as props.
 */
function drivenByTheRoom(
  initial: Partial<Parameters<typeof useControlledCat>[0]> = {},
) {
  return renderHook(
    (props: Parameters<typeof useControlledCat>[0]) => useControlledCat(props),
    {
      initialProps: { asleep: false, bounds, catSize, cats: [], myParticipantId: null, ...initial },
    },
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

/**
 * The cat a person is driving is drawn from local state, because the room never echoes
 * their own movement back and there would be nothing to redraw from. That works right
 * up until the room moves it for them, and then the one cat that ignores the room is
 * the owner's own, standing in the middle of a screen that was just cleared.
 */
describe("useControlledCat and a cat the room moved", () => {
  it("goes where the room says when the room moves my cat", () => {
    const { result, rerender } = drivenByTheRoom({ myParticipantId: "p1" });
    act(() => result.current.requestControl("p1", { x: 400, y: 300 }));

    rerender({
      asleep: false,
      bounds,
      catSize,
      myParticipantId: "p1",
      cats: [cat({ participantId: "p1", x: 0.1, y: 0.9 })],
    });

    expect(result.current.controlledPosition).toEqual({ x: 80, y: 540 });
  });

  it("stays put when somebody else's cat moves", () => {
    const { result, rerender } = drivenByTheRoom({
      myParticipantId: "p1",
      cats: [cat({ participantId: "p1", x: 0.5, y: 0.5 })],
    });
    act(() => result.current.requestControl("p1", { x: 400, y: 300 }));

    rerender({
      asleep: false,
      bounds,
      catSize,
      myParticipantId: "p1",
      cats: [
        cat({ participantId: "p1", x: 0.5, y: 0.5 }),
        cat({ participantId: "p2", x: 0.2, y: 0.3 }),
      ],
    });

    expect(result.current.controlledPosition).toEqual({ x: 400, y: 300 });
  });

  /**
   * Publishing divides by the viewport and the room's copy divides back, so the number
   * can come back a fraction off. Adopting that would put the cat back where it was
   * told to go on every echo and it would never settle.
   */
  it("does not treat a fraction of a pixel as the room moving it", () => {
    const { result, rerender } = drivenByTheRoom({ myParticipantId: "p1" });
    act(() => result.current.requestControl("p1", { x: 400, y: 300 }));
    act(() => result.current.moveControlled(100, 0));

    rerender({
      asleep: false,
      bounds,
      catSize,
      myParticipantId: "p1",
      cats: [
        cat({
          participantId: "p1",
          x: 500.5 / bounds.width,
          y: 300.5 / bounds.height,
        }),
      ],
    });

    expect(result.current.controlledPosition).toEqual({ x: 500, y: 300 });
  });

  it("walks on from where the room put it rather than from where it was", () => {
    const { result, rerender } = drivenByTheRoom({ myParticipantId: "p1" });
    act(() => result.current.requestControl("p1", { x: 400, y: 300 }));

    rerender({
      asleep: false,
      bounds,
      catSize,
      myParticipantId: "p1",
      cats: [cat({ participantId: "p1", x: 0.1, y: 0.9 })],
    });
    act(() => result.current.moveControlled(0, -50));

    // 540 is where the room put it and 490 is a step up from there. Had the adoption
    // not happened the step would have started from 300 and landed on 250.
    expect(result.current.controlledPosition).toEqual({ x: 80, y: 490 });
  });
});

/**
 * Taken while the room moves a cat nobody is holding. Adopting the position into the
 * local state without taking hold of the cat put the two out of step: the drawing
 * switched to the held position while nothing was held, and the next focus change
 * picked up that stray position and declared the cat held after all. A cat that is not
 * held already reads the room's number, so there is nothing here to adopt.
 */
describe("useControlledCat and a cat nobody is holding", () => {
  it("leaves a cat it is not holding to the room's own numbers", () => {
    const { result, rerender } = drivenByTheRoom({
      myParticipantId: "p1",
      cats: [cat({ participantId: "p1", x: 0.5, y: 0.5 })],
    });

    rerender({
      asleep: false,
      bounds,
      catSize,
      myParticipantId: "p1",
      cats: [cat({ participantId: "p1", x: 0.08, y: 0.92 })],
    });

    expect(result.current.controlledPosition).toBeNull();
    expect(result.current.controlledId).toBeNull();
  });

  it("still takes a held cat where the room put it", () => {
    const { result, rerender } = drivenByTheRoom({ myParticipantId: "p1" });
    act(() => result.current.requestControl("p1", { x: 400, y: 300 }));

    rerender({
      asleep: false,
      bounds,
      catSize,
      myParticipantId: "p1",
      cats: [cat({ participantId: "p1", x: 0.08, y: 0.92 })],
    });

    expect(result.current.controlledPosition).toEqual({ x: 64, y: 552 });
    expect(result.current.controlledId).toBe("p1");
  });
});
