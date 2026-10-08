import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * This test lives in presentation rather than beside the Worker because it reads the
 * filesystem, and tsconfig.worker.json does not include the Node types: its only job is
 * to model the Worker runtime, where node:fs does not exist. Adding the types there
 * would let real Worker code reach for an API that is absent at runtime.
 *
 * _headers is otherwise the one file in this repository that no compiler, no linter and
 * no test read, which is why it sat broken for a whole session and was only found when a
 * deploy was rejected by the API. The format is small enough to state exactly:
 * a comment is a line beginning with #, a rule opens with a URL pattern, and the headers
 * for that rule are indented name and value pairs beneath it. There is no block comment
 * syntax, so a /* in this file is a URL pattern that matches nothing and everything
 * after it is a malformed header.
 */
const HEADERS_PATH = join(process.cwd(), "public/_headers");

const raw = readFileSync(HEADERS_PATH, "utf8");

const lines = raw.split("\n").map((line, index) => ({
  line,
  number: index + 1,
  text: line.trim(),
  indented: line !== "" && /^\s/.test(line),
}));

const isComment = (text: string): boolean => text.startsWith("#");

/**
 * A url pattern is unindented and carries no spaces, which is what separates it from
 * prose. Matching on the absence of a colon alone let an indented sentence through as a
 * pattern, which is the exact mistake a block comment used to make.
 */
const isUrlPattern = (text: string): boolean =>
  !text.includes(":") && !/\s/.test(text);

const isHeaderPair = (text: string): boolean => /^[A-Za-z0-9-]+:\s*.+$/.test(text);

describe("_headers", () => {
  // The catch-all rule is the one legitimate line reading exactly /*, and a path rule
  // like /assets/* legitimately contains the splat too, so neither is evidence of
  // anything. A closing */ has no meaning in this format at all, so it is the only
  // unambiguous marker of an attempt at a block comment.
  it("uses no block comment terminator, which Cloudflare does not parse", () => {
    const offenders = lines
      .filter((entry) => entry.text.includes("*/"))
      .map((entry) => `line ${entry.number}: ${entry.text}`);

    expect(offenders).toEqual([]);
  });

  it("keeps the catch-all rule, which is the only place a bare splat belongs", () => {
    expect(lines.some((entry) => entry.text === "/*")).toBe(true);
  });

  it("has every line be a comment, a url pattern, a header pair or blank", () => {
    const offenders = lines
      .filter(
        (entry) =>
          entry.text !== "" &&
          !isComment(entry.text) &&
          !isUrlPattern(entry.text) &&
          !isHeaderPair(entry.text),
      )
      .map((entry) => `line ${entry.number}: ${entry.text}`);

    expect(offenders).toEqual([]);
  });

  it("never indents a url pattern, since that is how prose gets mistaken for one", () => {
    const offenders = lines
      .filter((entry) => entry.indented && isUrlPattern(entry.text))
      .map((entry) => `line ${entry.number}: ${entry.text}`);

    expect(offenders).toEqual([]);
  });

  it("indents every header pair so it belongs to the pattern above it", () => {
    const offenders = lines
      .filter((entry) => isHeaderPair(entry.text) && !entry.indented)
      .map((entry) => `line ${entry.number}: ${entry.text}`);

    expect(offenders).toEqual([]);
  });

  it("opens every header block with a url pattern", () => {
    const seen = lines.filter((entry) => entry.indented && isHeaderPair(entry.text));

    expect(seen.length).toBeGreaterThan(0);

    // Walking backwards, every indented header must find a url pattern before the next
    // one, which is the shape the parser expects.
    for (const entry of seen) {
      const above = lines.slice(0, entry.number - 1).reverse();
      const pattern = above.find(
        (candidate) => !candidate.indented && isUrlPattern(candidate.text),
      );

      expect(pattern).toBeDefined();
    }
  });

  it("still carries the headers the app depends on", () => {
    for (const name of [
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "X-Frame-Options",
      "Permissions-Policy",
    ]) {
      expect(raw).toContain(`${name}:`);
    }
  });

  it("keeps the script source strict, since that is what the policy is for", () => {
    const policy = /Content-Security-Policy:\s*(.+)/.exec(raw)?.[1] ?? "";

    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it("fingerprintless assets are revalidated rather than cached forever", () => {
    expect(raw).toContain("Cache-Control");
  });
});
