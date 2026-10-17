import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const theme = readFileSync(
  join(process.cwd(), "src/presentation/styles/theme.css"),
  "utf8",
);

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(theme)?.[1] ?? "";
}

describe("the cat overlay", () => {
  it("does not let a cat swallow clicks meant for the board", () => {
    const overlay = rule(".cat-overlay");

    expect(overlay).toContain("pointer-events: none");
  });

  /**
   * Every cat walks the full width of the viewport with a hit area the size of the
   * sprite. Only the one you can actually drive is worth clicking, so only that one
   * may intercept the vote grid underneath it.
   */
  it("gives a cat that cannot be driven no click of its own", () => {
    const guarded = rule('.cat:not([data-controllable="true"]) .cat__button');

    expect(guarded).toContain("pointer-events: none");
  });

  it("keeps the controls reachable when hover cannot be relied on", () => {
    const noHover = new RegExp(
      "@media\\s*\\(hover:\\s*none\\)[\\s\\S]*?\\.cat-controls\\s*\\{([^}]*)\\}",
    ).exec(theme)?.[1] ?? "";

    // A touchscreen laptop reports a coarse pointer while still running the overlay,
    // and there is no hover to reveal controls that only appear on hover.
    expect(noHover).toContain("opacity: 1");
  });

  it("keeps the controls visible where opacity is not the thing being drawn", () => {
    const forced = new RegExp(
      "@media\\s*\\(forced-colors:\\s*active\\)[\\s\\S]*?\\.cat-controls\\s*\\{([^}]*)\\}",
    ).exec(theme)?.[1] ?? "";

    // Forced-colors mode routinely overrides opacity, which would otherwise leave a
    // control that is in the accessibility tree and drawn nowhere.
    expect(forced).toContain("opacity: 1");
  });

  /**
   * The sprite sets its own facing, and the jump animation reads it there. Animating
   * a second, separate direction on the cat itself could never reach the sprite, so it
   * was four declarations that moved nothing: a cat crossed the screen and turned
   * around inside a property nothing was reading.
   */
  it("does not animate a direction on the cat that the sprite cannot see", () => {
    const patrol = /@keyframes cat-patrol\s*\{[\s\S]*?\n\}/.exec(theme)?.[0] ?? "";

    expect(patrol).not.toContain("--cat-direction");
  });

  /**
   * The overlay covers the viewport and switches pointer events off so the cats float
   * over the board without swallowing it. Everything inside it that a person is meant
   * to touch has to switch them back on, and anything that forgets inherits the
   * silence: it is painted, it sits in the accessibility tree, and it cannot be
   * clicked. jsdom does not evaluate pointer-events, so nothing else here would say so.
   */
  it("lets the reader reach the conversation through the overlay", () => {
    expect(rule(".chat-transcript__open")).toContain("pointer-events: auto");
    expect(rule(".chat-transcript")).toContain("pointer-events: auto");
  });

  /**
   * A cat being driven is lifted above the rest of the overlay, and a panel of text
   * that a cat walks across is a panel somebody cannot read. Both are inside the
   * overlay's own stacking context, so the fix is a number rather than a portal.
   */
  it("keeps the conversation clear of a cat somebody is driving", () => {
    const controlledCat = Number(
      /z-index:\s*(\d+)/.exec(rule('.cat[data-controlled="true"]'))?.[1] ?? "0",
    );
    const panel = Number(/z-index:\s*(\d+)/.exec(rule(".chat-transcript"))?.[1] ?? "0");
    const launcher = Number(
      /z-index:\s*(\d+)/.exec(rule(".chat-transcript__open"))?.[1] ?? "0",
    );

    expect(panel).toBeGreaterThan(controlledCat);
    expect(launcher).toBeGreaterThan(controlledCat);
  });

  it("declares a body font for the fields that ask for one", () => {
    const themeBlock = /@theme\s*\{([\s\S]*?)\n\}/.exec(theme)?.[1] ?? "";

    expect(themeBlock).toContain("--font-body:");
  });

  it("keeps no rule for an element nothing renders", () => {
    expect(theme).not.toContain(".cat__figure");
  });

  /**
   * Walking the cats out to the walls is the whole gesture. A cat that blinks from the
   * middle of the room to the edge reads as a glitch rather than as being moved.
   */
  it("lets a cat glide to where the room put it", () => {
    const gliding = rule('.cat[data-synced="true"]');

    expect(gliding).toContain("transition");
    expect(gliding).toContain("left");
    expect(gliding).toContain("top");
  });

  it("does not glide a cat that has no position of its own", () => {
    const unsynced = rule('.cat:not([data-synced="true"])');

    expect(unsynced).not.toContain("transition");
  });

  /**
   * The overlay is transparent to clicks so the board underneath stays reachable, and
   * nothing opts a child back in by itself. This is the same trap the transcript dock
   * fell into: a control that is in the DOM, in the accessibility tree, and dead.
   */
  it("makes the shoo pressable through a click-through overlay", () => {
    expect(rule(".cat-shoo")).toContain("pointer-events: auto");
  });

  it("keeps a cat from covering the control that moves it", () => {
    const shooZ = /z-index:\s*(\d+)/.exec(rule(".cat-shoo"))?.[1];
    const controlledZ = /z-index:\s*(\d+)/.exec(rule('.cat[data-controlled="true"]'))?.[1];

    expect(Number(shooZ)).toBeGreaterThan(Number(controlledZ));
  });
});
