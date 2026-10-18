import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "@application/i18n";
import { BuildStamp } from "@presentation/BuildStamp";

const COMMIT = "a236738da190a55781a647b51e692daf972b1b55";
const THEME = readFileSync(join(process.cwd(), "src/presentation/styles/theme.css"), "utf8");

describe("BuildStamp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the short revision and links to its full GitHub commit", () => {
    render(<BuildStamp commit={COMMIT} translate={createTranslator("en-US")} />);

    const link = screen.getByRole("link", { name: "Build a236738, view on GitHub" });
    expect(link.textContent).toBe("a236738");
    expect(link.getAttribute("href")).toBe(
      "https://github.com/skvggor/hanko/commit/a236738da190a55781a647b51e692daf972b1b55",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.className).toContain("bg-paper-raised");
    expect(link.className).toContain("border-line");
    expect(link.className).not.toContain("bg-primary");
    expect(link.className).toContain("min-h-6");
    expect(link.className).not.toContain("transition");
  });

  it("translates the accessible link name", () => {
    render(<BuildStamp commit={COMMIT} translate={createTranslator("pt-BR")} />);

    expect(
      screen.getByRole("link", { name: "Build a236738, ver no GitHub" }),
    ).toBeTruthy();
  });

  it("aligns the hash and external-link icon on the same line", () => {
    const { container } = render(
      <BuildStamp commit={COMMIT} translate={createTranslator("en-US")} />,
    );

    expect(container.querySelector("a span")?.className).toContain("leading-none");
    expect(container.querySelector("a svg")?.getAttribute("class")).toContain("block");
  });

  it("floats with subtle perspective and stands still for reduced motion", () => {
    expect(THEME).toMatch(/@keyframes\s+build-stamp-float/);
    expect(THEME).toMatch(/\.build-stamp\s*\{[^}]*animation:\s*build-stamp-float/);
    expect(THEME).toMatch(
      /\[data-reduced-motion="true"\]\s+\.build-stamp\s*\{[^}]*animation:\s*none/,
    );
  });

  /**
   * The pill becomes a squared tile on hover so the chip reads as a pressable object
   * rather than a label, and the digit scramble is what confirms the press landed.
   */
  it("morphs from a pill into a squared tile on hover", () => {
    const transition = /\.build-stamp\s*\{([^}]*)\}/.exec(THEME)?.[1] ?? "";
    const hovered = /\.build-stamp:hover\s*,\s*\.build-stamp:focus-visible\s*\{([^}]*)\}/
      .exec(THEME)?.[1] ?? "";

    expect(transition).toMatch(/transition:[^;]*border-radius/);
    expect(transition).toMatch(/transition:[^;]*background-color/);
    expect(hovered).toMatch(/border-radius:\s*0\.125rem/);
  });

  it("keeps the scrambling digits from shifting the chip", () => {
    expect(THEME).toMatch(/\.build-stamp__digits\s*\{[^}]*font-variant-numeric:\s*tabular-nums/);
  });

  it("scrambles the commit briefly on hover and then settles back", () => {
    vi.useFakeTimers();
    try {
      render(<BuildStamp commit={COMMIT} translate={createTranslator("en-US")} />);
      const link = screen.getByRole("link", { name: "Build a236738, view on GitHub" });
      const digits = link.querySelector("span");
      if (digits === null) throw new Error("the visible commit text should exist");

      act(() => {
        fireEvent.mouseEnter(link);
      });
      act(() => {
        vi.advanceTimersByTime(40);
      });
      expect(digits.textContent).not.toBe("a236738");
      expect(link.getAttribute("aria-label")).toBe("Build a236738, view on GitHub");

      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(digits.textContent).toBe("a236738");

      act(() => {
        fireEvent.mouseLeave(link);
      });
      expect(digits.textContent).toBe("a236738");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not scramble the commit when reduced motion is requested", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    try {
      render(<BuildStamp commit={COMMIT} translate={createTranslator("en-US")} />);
      const link = screen.getByRole("link", { name: "Build a236738, view on GitHub" });

      act(() => {
        fireEvent.mouseEnter(link);
      });
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(link.querySelector("span")?.textContent).toBe("a236738");
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts for the keyboard and settles when the focus leaves the chip", () => {
    vi.useFakeTimers();
    try {
      render(<BuildStamp commit={COMMIT} translate={createTranslator("en-US")} />);
      const link = screen.getByRole("link", { name: "Build a236738, view on GitHub" });

      act(() => {
        fireEvent.focus(link);
      });
      act(() => {
        vi.advanceTimersByTime(40);
      });
      expect(link.querySelector("span")?.textContent).not.toBe("a236738");

      act(() => {
        fireEvent.blur(link);
      });
      expect(link.querySelector("span")?.textContent).toBe("a236738");
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * The shell publishes the motion preference it resolved onto the document, so the
   * chip reads the same decision the stylesheet already honours rather than asking
   * the media query a second time and possibly hearing a different answer.
   */
  it("does not scramble the commit when the document asks for reduced motion", () => {
    vi.useFakeTimers();
    try {
      render(
        <div data-reduced-motion="true">
          <BuildStamp commit={COMMIT} translate={createTranslator("en-US")} />
        </div>,
      );
      const link = screen.getByRole("link", { name: "Build a236738, view on GitHub" });

      act(() => {
        fireEvent.mouseEnter(link);
      });
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(link.querySelector("span")?.textContent).toBe("a236738");
    } finally {
      vi.useRealTimers();
    }
  });

  it("is absent when the build did not include a valid commit", () => {
    const { container } = render(
      <BuildStamp commit="" translate={createTranslator("en-US")} />,
    );

    expect(container.querySelector("a")).toBeNull();
  });
});
