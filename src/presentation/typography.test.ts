import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The whole point of the fluid root is that one knob scales the entire interface, and
 * a single hardcoded pixel font size quietly opts a piece of the UI out of it. A px size
 * does not grow when the root does, so on a large display that element stays the size it
 * was on a phone while everything around it swells, and the layout reads as broken
 * rather than merely small.
 *
 * This is a source level rule rather than a rendered measurement because that is the
 * only place the regression can be caught before it ships.
 */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return entry.name === "styles" ? [] : sourceFiles(path);
    }

    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const files = sourceFiles(join(process.cwd(), "src/presentation"));

const themePath = join(process.cwd(), "src/presentation/styles/theme.css");

const FIXED_PIXEL_FONT = /text-\[\d+(?:\.\d+)?px\]/g;

describe("proportional typography", () => {
  it("has presentation sources to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("keeps every font size relative so the fluid root can scale it", () => {
    const offenders = files.flatMap((file) => {
      const matches = readFileSync(file, "utf8").match(FIXED_PIXEL_FONT);
      return matches === null ? [] : matches.map((match) => `${file}: ${match}`);
    });

    expect(offenders).toEqual([]);
  });

  it("keeps the font sizes in the stylesheet relative as well", () => {
    const theme = readFileSync(themePath, "utf8");
    const offenders = [...theme.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(
      (match) => match[0],
    );

    expect(offenders).toEqual([]);
  });

  it("scales the root font with the viewport instead of pinning it", () => {
    const theme = readFileSync(themePath, "utf8");

    expect(theme).toMatch(/html\s*\{[^}]*font-size:\s*clamp\(/s);
  });

  it("gives the fluid root a lower bound so text stays readable on a phone", () => {
    const theme = readFileSync(themePath, "utf8");

    expect(theme).toMatch(/font-size:\s*clamp\([^,]+,[^,]+,[^)]+\)/);
  });

  it("caps the width of a long measure rather than letting a line run the display", () => {
    const shell = readFileSync(join(process.cwd(), "src/presentation/Shell.tsx"), "utf8");

    expect(shell).toContain("max-w-");
  });
});
