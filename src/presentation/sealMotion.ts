import { gsap } from "gsap";

/**
 * What the seal is doing, and to what. The component owns the elements and the decision
 * to morph; this only knows how to move ink, which is why it lives apart from the markup.
 */
export interface SealMorph {
  motion: "press" | "release";
  seal: HTMLElement | null;
  placeholder: HTMLElement | null;
  bleed: HTMLElement | null;
  /** One entry per character of whatever is inside the seal. */
  glyphs: readonly HTMLElement[];
  /** Runs when the ink comes to rest, which is when the seal is allowed to dry. */
  settle: () => void;
}

/**
 * Returns how to abandon a morph in flight, so a vote that is undone before the ink has
 * landed does not leave two timelines writing to the same nodes.
 */
export type SealMorpher = (morph: SealMorph) => (() => void) | void;

/** The outline a waiting seal wears, matched to the ring's resting border. */
const PLACEHOLDER_COLOR = "#a8a294";
const IDLE_COLOR = "#a8a294";
const INK_COLOR = "#b8371e";
const ON_INK_COLOR = "#fff9f4";

const PRESS_SECONDS = 0.46;
const RELEASE_SECONDS = 0.32;

function pressTimeline({ bleed, glyphs, placeholder, seal, settle }: SealMorph) {
  return gsap
    .timeline({ onComplete: settle })
    .fromTo(
      placeholder,
      { autoAlpha: 1, scale: 1, yPercent: 0 },
      { autoAlpha: 0, scale: 0.55, yPercent: -30, duration: 0.22, ease: "power2.in" },
      0,
    )
    .fromTo(
      glyphs,
      { autoAlpha: 0, rotate: -16, scale: 0.3, yPercent: 40 },
      {
        autoAlpha: 1,
        rotate: -3,
        scale: 1,
        yPercent: 0,
        duration: PRESS_SECONDS,
        ease: "back.out(2.4)",
        stagger: 0.05,
      },
      0,
    )
    .fromTo(
      seal,
      { backgroundColor: "transparent", borderColor: IDLE_COLOR },
      {
        backgroundColor: INK_COLOR,
        borderColor: INK_COLOR,
        color: ON_INK_COLOR,
        duration: 0.3,
        ease: "power2.out",
      },
      0,
    )
    .fromTo(
      bleed,
      { autoAlpha: 0.55, scale: 1.6 },
      { autoAlpha: 0, scale: 1, duration: 0.56, ease: "power2.out" },
      0,
    );
}

function releaseTimeline({ glyphs, placeholder, seal, settle }: SealMorph) {
  return gsap
    .timeline({ onComplete: settle })
    .to(
      glyphs,
      {
        autoAlpha: 0,
        scale: 0.5,
        yPercent: -30,
        duration: RELEASE_SECONDS * 0.75,
        ease: "power2.in",
        stagger: 0.04,
      },
      0,
    )
    .to(
      seal,
      {
        backgroundColor: "transparent",
        borderColor: IDLE_COLOR,
        duration: RELEASE_SECONDS,
        ease: "power2.inOut",
      },
      0,
    )
    .to(
      placeholder,
      {
        autoAlpha: 1,
        scale: 1,
        yPercent: 0,
        color: PLACEHOLDER_COLOR,
        duration: RELEASE_SECONDS,
        ease: "back.out(1.8)",
      },
      RELEASE_SECONDS * 0.3,
    );
}

/**
 * The morph itself. The reduced motion branch is the same story told instantly: ink lands
 * with no travel, which is what the stylesheet kill switch does everywhere else, and it
 * goes through matchMedia rather than the attribute so the listener comes for free.
 */
export const morphSeal: SealMorpher = (morph) => {
  // Shell guards the same query before it reads it, and matchMedia is absent under jsdom
  // and under any server rendering, so a morph has to be able to run without one.
  if (typeof globalThis.matchMedia !== "function") {
    morph.settle();
    return;
  }

  const media = gsap.matchMedia();
  const build = morph.motion === "press" ? pressTimeline : releaseTimeline;

  media.add("(prefers-reduced-motion: reduce)", () => {
    if (morph.seal !== null) {
      gsap.set(morph.seal, {
        backgroundColor: morph.motion === "press" ? INK_COLOR : "transparent",
        borderColor: morph.motion === "press" ? INK_COLOR : IDLE_COLOR,
        color: morph.motion === "press" ? ON_INK_COLOR : INK_COLOR,
      });
    }
    gsap.set(morph.glyphs, { autoAlpha: morph.motion === "press" ? 1 : 0 });
    gsap.set(morph.placeholder, { autoAlpha: morph.motion === "press" ? 0 : 1 });
    morph.settle();
  });

  media.add("(prefers-reduced-motion: no-preference)", () => {
    const timeline = build(morph);

    return () => {
      timeline.kill();
    };
  });

  return () => media.revert();
};