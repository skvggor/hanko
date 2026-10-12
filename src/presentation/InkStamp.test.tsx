import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InkStamp, HankoStamp, type SealMorpher } from "@presentation/InkStamp";
import type { SealMorph } from "@presentation/sealMotion";
import { createTranslator } from "@application/i18n";

const translate = createTranslator("en-US");

/**
 * The morph is injected rather than mocked, which is the same seam the room connection
 * uses for its socket. It also keeps jsdom out of the business of running a timeline: a
 * test drives the settle by calling it, instead of racing a clock against a library that
 * was never going to run there.
 */
function morphSpy(): SealMorpher {
  return vi.fn();
}

function lastMotion(morpher: SealMorpher): SealMorph {
  const call = vi.mocked(morpher).mock.calls.at(-1);
  if (call === undefined) throw new Error("the morph never ran");

  return call[0];
}

function settleLast(morpher: SealMorpher): void {
  lastMotion(morpher).settle();
}

function stamp(value: string | null, overrides: Record<string, unknown> = {}) {
  const morph = morphSpy();
  const view = render(
    <InkStamp label={value === null ? "Waiting" : `Stamped ${value}`} morph={morph} value={value} {...overrides} />,
  );

  return { morph, ...view };
}

function phase(container: Element): string | null {
  return container.querySelector("[data-phase]")?.getAttribute("data-phase") ?? null;
}

describe("InkStamp slot", () => {
  it("holds its place before anything is pressed", () => {
    const { container } = stamp(null);

    expect(container.querySelector("[data-seal]")).not.toBeNull();
    expect(phase(container)).toBe("waiting");
  });

  it("holds the same place once the vote is undone", () => {
    const { container, morph, rerender } = stamp("8");

    rerender(<InkStamp label="Waiting" morph={morph} value={null} />);

    expect(container.querySelector("[data-seal]")).not.toBeNull();
  });

  it("waits in a faint placeholder rather than an empty box", () => {
    const { container } = stamp(null);

    expect(container.querySelector("[data-placeholder]")).not.toBeNull();
  });

  it("keeps the placeholder mounted so it has something to morph back from", () => {
    const { container } = stamp("8");

    expect(container.querySelector("[data-placeholder]")).not.toBeNull();
    expect(container.querySelector("[data-glyph]")).not.toBeNull();
  });
});

describe("InkStamp morph", () => {
  it("presses when the value arrives", () => {
    const morph = morphSpy();
    const { rerender } = render(<InkStamp label="Waiting" morph={morph} value={null} />);

    rerender(<InkStamp label="Stamped 8" morph={morph} value="8" />);

    expect(morph).toHaveBeenCalledTimes(1);
    expect(lastMotion(morph).motion).toBe("press");
  });

  it("releases when the value goes away", () => {
    const morph = morphSpy();
    const { rerender } = render(<InkStamp label="Stamped 8" morph={morph} value="8" />);

    rerender(<InkStamp label="Waiting" morph={morph} value={null} />);

    expect(lastMotion(morph).motion).toBe("release");
  });

  it("splits the value into one glyph per character", () => {
    const morph = morphSpy();
    const { container } = render(<InkStamp label="Café" morph={morph} value="Café" />);

    const glyphs = container.querySelectorAll("[data-glyph]");

    expect(glyphs).toHaveLength(4);
    expect([...glyphs].map((glyph) => glyph.textContent).join("")).toBe("Café");
  });

  it("dries the seal once the morph settles", () => {
    const morph = morphSpy();
    const { container } = render(<InkStamp label="Stamped 8" morph={morph} value="8" />);

    expect(phase(container)).toBe("wet");

    act(() => settleLast(morph));

    expect(phase(container)).toBe("drying");
  });

  it("holds the value on screen until the ink has lifted", () => {
    const morph = morphSpy();
    const { container, rerender } = render(<InkStamp label="Stamped 8" morph={morph} value="8" />);

    act(() => settleLast(morph));
    rerender(<InkStamp label="Waiting" morph={morph} value={null} />);

    expect(screen.getByText("8")).toBeTruthy();

    act(() => settleLast(morph));

    expect(container.querySelector("[data-glyph]")).toBeNull();
  });

  it("falls back to the placeholder when an undo outruns the press", () => {
    const morph = morphSpy();
    const { container, rerender } = render(<InkStamp label="Stamped 8" morph={morph} value="8" />);

    rerender(<InkStamp label="Waiting" morph={morph} value={null} />);

    expect(container.querySelector("[data-placeholder]")).not.toBeNull();
    expect(() => act(() => settleLast(morph))).not.toThrow();
  });

  it("replays the press when the same value comes back after an undo", () => {
    const morph = morphSpy();
    const { rerender } = render(<InkStamp label="Waiting" morph={morph} pressId={0} value={null} />);

    rerender(<InkStamp label="Stamped 8" morph={morph} pressId={0} value="8" />);
    rerender(<InkStamp label="Waiting" morph={morph} pressId={1} value={null} />);
    rerender(<InkStamp label="Stamped 8" morph={morph} pressId={1} value="8" />);

    expect(vi.mocked(morph).mock.calls.filter((call) => call[0].motion === "press"))
      .toHaveLength(2);
  });

  it("does not run a morph on the first render", () => {
    const morph = morphSpy();

    render(<InkStamp label="Waiting" morph={morph} value={null} />);

    expect(morph).toHaveBeenCalledTimes(0);
  });

  it("hands the morph the ring and the glyphs to animate", () => {
    const morph = morphSpy();
    const { container } = render(<InkStamp label="Stamped 8" morph={morph} value="8" />);

    const { seal, glyphs } = vi.mocked(morph).mock.calls[0]?.[0] ?? { glyphs: [], seal: null };

    expect(seal).toBe(container.querySelector("[data-seal]"));
    expect(glyphs).toHaveLength(1);
  });
});

describe("InkStamp accessibility", () => {
  it("describes the placeholder for assistive tech", () => {
    render(<InkStamp label="Waiting for your estimate" morph={morphSpy()} value={null} />);

    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Waiting for your estimate");
  });

  it("describes the stamped value instead of the placeholder", () => {
    render(<InkStamp label="Stamped 8" morph={morphSpy()} value="8" />);

    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Stamped 8");
  });

  it("keeps every decorative layer out of the accessibility tree", () => {
    const { container } = render(<InkStamp label="Stamped 8" morph={morphSpy()} value="8" />);

    for (const selector of ["[data-seal]", "[data-placeholder]", "[data-bleed]", "[data-glyph]"]) {
      for (const node of container.querySelectorAll(selector)) {
        expect(node.getAttribute("aria-hidden")).toBe("true");
      }
    }
  });
});

describe("HankoStamp", () => {
  it("labels the stamp with its value", () => {
    render(<HankoStamp morph={morphSpy()} myVote="8" pressId={0} translate={translate} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Stamped 8");
  });

  it("translates the stamp label", () => {
    render(<HankoStamp morph={morphSpy()} myVote="13" pressId={0} translate={createTranslator("pt-BR")} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Carimbado 13");
  });

  it("waits in the placeholder without a vote", () => {
    const { container } = render(
      <HankoStamp morph={morphSpy()} myVote={null} pressId={0} translate={translate} />,
    );

    expect(phase(container)).toBe("waiting");
    expect(container.querySelector("[data-placeholder]")).not.toBeNull();
  });

  it("stamps the same label the vote card shows, not the raw value", () => {
    const { container } = render(
      <HankoStamp
        morph={morphSpy()}
        myVote="coffee"
        pressId={0}
        translate={createTranslator("pt-BR")}
      />,
    );

    expect([...container.querySelectorAll("[data-glyph]")].map((g) => g.textContent).join(""))
      .toBe("Café");
  });
});

describe("InkStamp long labels", () => {
  function sealOf(container: Element): Element {
    const seal = container.querySelector("[data-seal]");
    if (!seal) throw new Error("no seal");
    return seal;
  }

  function fontRem(element: Element): number {
    const match = /text-\[([\d.]+)rem\]/.exec(element.className);
    if (!match?.[1]) throw new Error(`no fixed font size on ${element.className}`);
    return Number(match[1]);
  }

  it("shrinks a word so the ring still contains it", () => {
    const { container } = render(<InkStamp label="Coffee" morph={morphSpy()} value="Coffee" />);

    expect(fontRem(sealOf(container))).toBeLessThan(1.25);
  });

  it("keeps a number large, since a number is what the seal is for", () => {
    const { container } = render(<InkStamp label="13" morph={morphSpy()} value="13" />);

    expect(fontRem(sealOf(container))).toBeGreaterThan(2);
  });

  it("scales down as the label gets longer rather than clipping at one threshold", () => {
    const { container: short } = render(<InkStamp label="13" morph={morphSpy()} value="13" />);
    const { container: longer } = render(<InkStamp label="Café" morph={morphSpy()} value="Café" />);

    expect(fontRem(sealOf(longer))).toBeLessThan(fontRem(sealOf(short)));
  });

  it("still describes the stamp for a screen reader", () => {
    render(
      <HankoStamp
        morph={morphSpy()}
        myVote="coffee"
        pressId={0}
        translate={createTranslator("pt-BR")}
      />,
    );

    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Café");
  });
});