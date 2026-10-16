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

  it("declares a body font for the fields that ask for one", () => {
    const themeBlock = /@theme\s*\{([\s\S]*?)\n\}/.exec(theme)?.[1] ?? "";

    expect(themeBlock).toContain("--font-body:");
  });

  it("keeps no rule for an element nothing renders", () => {
    expect(theme).not.toContain(".cat__figure");
  });
});