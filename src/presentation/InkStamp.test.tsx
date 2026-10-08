import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InkStamp, HankoStamp } from "@presentation/InkStamp";
import { createTranslator } from "@application/i18n";

const translate = createTranslator("en-US");

describe("InkStamp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("renders nothing without a vote", () => {
    const { container } = render(<InkStamp label="idle" value={null} />);
    expect(container.querySelector("[data-phase]")).toBeNull();
  });

  it("shows the stamped value", () => {
    render(<InkStamp label="Stamped 8" value="8" />);
    expect(screen.getByText("8")).toBeTruthy();
  });

  it("starts wet so the press animation plays", () => {
    const { container } = render(<InkStamp label="seal" value="8" />);
    expect(container.querySelector("[data-phase]")?.getAttribute("data-phase")).toBe("wet");
  });

  it("dries after the bleed settles", () => {
    const { container } = render(<InkStamp label="seal" value="8" />);

    act(() => { vi.advanceTimersByTime(500); });

    expect(container.querySelector("[data-phase]")?.getAttribute("data-phase")).toBe("drying");
  });

  it("keeps the stamp visible after drying", () => {
    const { container } = render(<InkStamp label="seal" value="8" />);
    act(() => { vi.advanceTimersByTime(2000); });

    expect(screen.getByText("8")).toBeTruthy();
    expect(container.querySelector("[data-phase]")).not.toBeNull();
  });

  it("wipes when the vote is undone", () => {
    const { container, rerender } = render(<InkStamp label="seal" value="8" />);

    rerender(<InkStamp label="seal" value={null} />);

    expect(container.querySelector("[data-phase]")).toBeNull();
  });

  it("replays the press when the vote changes", () => {
    const { container, rerender } = render(<InkStamp label="seal" value="8" />);
    act(() => { vi.advanceTimersByTime(500); });

    rerender(<InkStamp label="seal" value="13" />);

    expect(container.querySelector("[data-phase]")?.getAttribute("data-phase")).toBe("wet");
    expect(screen.getByText("13")).toBeTruthy();
  });

  it("restarts the press when the press id changes", () => {
    const { container, rerender } = render(
      <InkStamp label="seal" pressId={0} value="8" />,
    );
    act(() => { vi.advanceTimersByTime(500); });

    rerender(<InkStamp label="seal" pressId={1} value="8" />);

    expect(container.querySelector("[data-phase]")?.getAttribute("data-phase")).toBe("wet");
  });

  it("renders an ink bleed layer", () => {
    const { container } = render(<InkStamp label="seal" value="8" />);
    expect(container.querySelector(".stamp-bleed")).not.toBeNull();
  });

  it("describes the stamp for assistive tech", () => {
    render(<InkStamp label="Stamped 8" value="8" />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Stamped 8");
  });

  it("hides the decorative layers", () => {
    const { container } = render(<InkStamp label="seal" value="8" />);
    expect(container.querySelector("[data-seal]")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".stamp-bleed")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("cancels the pending timer on unmount", () => {
    const { unmount } = render(<InkStamp label="seal" value="8" />);
    unmount();

    expect(() => act(() => { vi.advanceTimersByTime(1000); })).not.toThrow();
  });
});

describe("HankoStamp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("labels the stamp with its value", () => {
    render(<HankoStamp myVote="8" pressId={0} translate={translate} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Stamped 8");
  });

  it("translates the stamp label", () => {
    render(<HankoStamp myVote="13" pressId={0} translate={createTranslator("pt-BR")} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Carimbado 13");
  });

  it("renders nothing without a vote", () => {
    const { container } = render(<HankoStamp myVote={null} pressId={0} translate={translate} />);
    expect(container.querySelector("[data-phase]")).toBeNull();
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
    const { container } = render(<InkStamp label="Coffee" value="Coffee" />);

    expect(fontRem(sealOf(container))).toBeLessThan(1.25);
  });

  it("keeps a number large, since a number is what the seal is for", () => {
    const { container } = render(<InkStamp label="13" value="13" />);

    expect(fontRem(sealOf(container))).toBeGreaterThan(2);
  });

  it("scales down as the label gets longer rather than clipping at one threshold", () => {
    const { container: short } = render(<InkStamp label="13" value="13" />);
    const { container: longer } = render(<InkStamp label="Café" value="Café" />);

    expect(fontRem(sealOf(longer))).toBeLessThan(fontRem(sealOf(short)));
  });

  it("stamps the same label the vote card shows, not the raw value", () => {
    const translate = createTranslator("pt-BR");
    const { container } = render(
      <HankoStamp myVote="coffee" pressId={0} translate={translate} />,
    );

    expect(sealOf(container).textContent).toBe("Café");
  });

  it("still describes the stamp for a screen reader", () => {
    const translate = createTranslator("pt-BR");
    render(<HankoStamp myVote="coffee" pressId={0} translate={translate} />);

    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Café");
  });
});
