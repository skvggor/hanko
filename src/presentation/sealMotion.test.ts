import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { morphSeal, type SealMorph } from "@presentation/sealMotion";

interface RecordedTween {
  method: "fromTo" | "to" | "set";
  target: unknown;
  to: Record<string, unknown>;
}

const harness = vi.hoisted(() => {
  const tweens: RecordedTween[] = [];
  const mediaQueries: string[] = [];
  const state = {
    killed: 0,
    onComplete: null as (() => void) | null,
    prefersReduced: false,
    reverted: 0,
  };

  function recordFromTo(target: unknown, _from: unknown, to: Record<string, unknown>) {
    tweens.push({ method: "fromTo", target, to });
    return api;
  }

  function recordTo(target: unknown, to: Record<string, unknown>) {
    tweens.push({ method: "to", target, to });
    return api;
  }

  const api = {
    fromTo: recordFromTo,
    kill: () => {
      state.killed += 1;
    },
    matchMedia: () => ({
      add: (condition: string, run: () => unknown) => {
        mediaQueries.push(condition);
        const asksForLess = !condition.includes("no-preference");
        return asksForLess === state.prefersReduced ? run() : undefined;
      },
      revert: () => {
        state.reverted += 1;
      },
    }),
    set: (target: unknown, to: Record<string, unknown>) => {
      tweens.push({ method: "set", target, to });
      return api;
    },
    timeline: (config?: { onComplete?: () => void }) => {
      state.onComplete = config?.onComplete ?? null;
      return api;
    },
    to: recordTo,
  };

  return {
    api,
    mediaQueries,
    prefersReduced: () => { state.prefersReduced = true; },
    read: () => ({ onComplete: state.onComplete, reverted: state.reverted, tweens: [...tweens] }),
    reset: () => {
      tweens.length = 0;
      mediaQueries.length = 0;
      state.killed = 0;
      state.onComplete = null;
      state.prefersReduced = false;
      state.reverted = 0;
    },
  };
});

vi.mock("gsap", () => ({ gsap: harness.api }));

const INK = "#b8371e";

function aPress(overrides: Partial<SealMorph> = {}): SealMorph {
  return {
    bleed: document.createElement("span"),
    glyphs: [document.createElement("span")],
    motion: "press",
    placeholder: document.createElement("span"),
    seal: document.createElement("span"),
    settle: vi.fn(),
    ...overrides,
  };
}

function colourTweens(tweens: RecordedTween[]): RecordedTween[] {
  return tweens.filter((tween) => tween.to.backgroundColor !== undefined);
}

describe("morphSeal", () => {
  beforeEach(() => {
    harness.reset();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks about the motion preference before it plays anything", () => {
    morphSeal(aPress());

    expect(harness.mediaQueries).toEqual([
      "(prefers-reduced-motion: reduce)",
      "(prefers-reduced-motion: no-preference)",
    ]);
  });

  it("lands the ink on every glyph of the value", () => {
    morphSeal(aPress());
    const glyphTween = harness.read().tweens.find((tween) => Array.isArray(tween.target));

    expect(glyphTween?.to.autoAlpha).toBe(1);
    expect(glyphTween?.to.stagger).toBeGreaterThan(0);
  });

  it("inks the ring on a press and empties it on a release", () => {
    morphSeal(aPress());
    expect(colourTweens(harness.read().tweens)[0]?.to.backgroundColor).toBe(INK);

    harness.reset();
    morphSeal(aPress({ motion: "release" }));
    expect(colourTweens(harness.read().tweens)[0]?.to.backgroundColor).toBe("transparent");
  });

  it("scatters the value and reassembles the placeholder on a release", () => {
    morphSeal(aPress({ motion: "release" }));
    const fades = harness.read().tweens.filter((tween) => tween.to.autoAlpha !== undefined);

    expect(fades.some((tween) => tween.to.autoAlpha === 0)).toBe(true);
    expect(fades.some((tween) => tween.to.autoAlpha === 1)).toBe(true);
  });

  it("says the ink has come to rest only when the timeline says so", () => {
    const morph = aPress();
    morphSeal(morph);

    expect(morph.settle).not.toHaveBeenCalled();

    harness.read().onComplete?.();

    expect(morph.settle).toHaveBeenCalledTimes(1);
  });

  it("lets an undo abandon a morph that is still in flight", () => {
    const abandon = morphSeal(aPress());

    abandon?.();

    expect(harness.read().reverted).toBe(1);
  });

  it("tolerates a seal with no bleed ring to ink", () => {
    expect(() => morphSeal(aPress({ bleed: null }))).not.toThrow();
  });

  it("settles straight away when there is no motion query to read", () => {
    vi.stubGlobal("matchMedia", undefined);
    const morph = aPress();

    morphSeal(morph);

    expect(morph.settle).toHaveBeenCalledTimes(1);
    expect(harness.read().tweens).toHaveLength(0);
  });

  it("lands the ink without travelling when motion is reduced", () => {
    harness.prefersReduced();
    const morph = aPress();

    morphSeal(morph);

    expect(morph.settle).toHaveBeenCalledTimes(1);
    expect(harness.read().onComplete).toBeNull();
    expect(colourTweens(harness.read().tweens)[0]?.method).toBe("set");
    expect(colourTweens(harness.read().tweens)[0]?.to.backgroundColor).toBe(INK);
  });

  it("empties the ring without travelling when motion is reduced", () => {
    harness.prefersReduced();

    morphSeal(aPress({ motion: "release" }));

    expect(colourTweens(harness.read().tweens)[0]?.to.backgroundColor).toBe("transparent");
  });
});