import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Spacing is the thing that makes an interface feel designed, and it degrades the same
 * way typography does: every component reaching for whatever value felt right at the
 * time produces a set of near misses that read as untidy even when nothing is broken.
 * Fourteen different padding and gap values across the presentation layer is that
 * symptom.
 *
 * So the scale is a short list of named steps, declared once in the theme, and this
 * file is what keeps components on it. The names carry intent, which raw numbers do
 * not: `p-room` says how much air a panel needs, `gap-stack` says how far apart two
 * panels sit, and neither has to be re-guessed.
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

const theme = readFileSync(
  join(process.cwd(), "src/presentation/styles/theme.css"),
  "utf8",
);

/**
 * Values under 8px stay numeric on purpose. They are the optical corrections: nudging
 * an icon off a baseline, letting a chip breathe inside its own padding. Everything
 * from 8px up describes a rhythm between things, so it has to be a named step, and a
 * numeric `gap-2` would otherwise sit next to `gap-tight` meaning the same thing.
 */
const OFF_SCALE =
  /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y)-(\d+(?:\.\d+)?)\b/g;

const ALLOWED_NUMERIC = new Set(["0", "0.5", "1", "1.5"]);

const NAMED_STEPS = ["tight", "snug", "room", "gutter", "stack", "dock"];

describe("spacing scale", () => {
  it("has presentation sources to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("declares every step of the scale in the theme", () => {
    for (const step of NAMED_STEPS) {
      expect(theme).toContain(`--spacing-${step}:`);
    }
  });

  it("keeps every component on the scale", () => {
    const offenders = files.flatMap((file) => {
      const used = [...readFileSync(file, "utf8").matchAll(OFF_SCALE)]
        .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
        .filter((value) => !ALLOWED_NUMERIC.has(value));

      return [...new Set(used)].map((value) => `${file}: -${value}`);
    });

    expect(offenders).toEqual([]);
  });

  it("keeps the stylesheet padding on the same scale as the components", () => {
    const offenders = [...theme.matchAll(/(?:padding|gap|margin)[a-z-]*:\s*([\d.]+)rem\b/g)]
      .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
      .filter((value) => !ALLOWED_NUMERIC.has(value));

    expect(offenders).toEqual([]);
  });

  it("gives the content a measure wide enough to use a large display", () => {
    const shell = readFileSync(join(process.cwd(), "src/presentation/Shell.tsx"), "utf8");
    const match = /max-w-(\d+)/.exec(shell);

    expect(Number(match?.[1])).toBeGreaterThanOrEqual(150);
  });

  it("paces the page with the named gutter rather than an ad hoc padding", () => {
    const shell = readFileSync(join(process.cwd(), "src/presentation/Shell.tsx"), "utf8");

    expect(shell).toContain("px-gutter");
    expect(shell).toContain("pt-stack");
    expect(shell).toContain("pb-stack");
  });
});