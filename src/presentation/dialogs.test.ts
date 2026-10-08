import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * prompt, confirm and alert render a browser dialog the page cannot style. That costs
 * the hanko its own typography and spacing, and it puts an OS chrome panel in the middle
 * of an interface that is otherwise one continuous sheet of paper. More importantly it
 * is untestable in jsdom and untranslatable beyond its own title, so every one of them is
 * a place the design silently stops applying.
 *
 * The rule is absolute: anything that needs an answer gets a modal in the app's own
 * language, or none at all.
 */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(path);
    }

    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const files = sourceFiles(join(process.cwd(), "src"));

const NATIVE_DIALOG = /\b(?:globalThis|window)\s*\.\s*(prompt|confirm|alert)\s*\(/g;

describe("no native dialogs", () => {
  it("has sources to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("never opens a browser dialog", () => {
    const offenders = files.flatMap((file) => {
      const found = readFileSync(file, "utf8").match(NATIVE_DIALOG);
      return found === null ? [] : found.map((match) => `${file}: ${match}`);
    });

    expect(offenders).toEqual([]);
  });

  it("still owns a modal for the answers that need one", () => {
    // The rule above is only useful if there is somewhere to go instead, so the app
    // has to carry its own dialog rather than just refusing the built in ones.
    expect(files.some((file) => file.endsWith("ConfirmDialog.tsx"))).toBe(true);
  });

  it("gives the modal the affordances a native one would have had", () => {
    const dialog = readFileSync(
      join(process.cwd(), "src/presentation/ConfirmDialog.tsx"),
      "utf8",
    );

    expect(dialog).toContain("role=\"dialog\"");
    expect(dialog).toContain("aria-modal");
    expect(dialog).toContain("Escape");
  });
});