import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Wordmark } from "@presentation/Wordmark";

function liftOf(svg: SVGSVGElement, primitive: string): number {
  const value = svg.style.getPropertyValue(`--lift-${primitive}`);
  return value === "" ? 0 : Number(value);
}

function renderMark(size?: number): SVGSVGElement {
  const { container } = render(<Wordmark {...(size === undefined ? {} : { size })} />);
  const svg = container.querySelector("svg");
  if (!svg) throw new Error("the wordmark did not render an svg");
  return svg;
}

/**
 * The pointer maths reads clientX against the element box, and jsdom gives every
 * element a zero sized one. Without this the division collapses to NaN and the
 * whole clamp is untestable.
 */
function withBox(svg: SVGSVGElement, box: { left: number; top: number; width: number; height: number }) {
  svg.getBoundingClientRect = () =>
    ({ left: box.left, top: box.top, width: box.width, height: box.height }) as DOMRect;
}

function hover(
  svg: SVGSVGElement,
  point: { clientX: number; clientY: number },
): void {
  fireEvent.pointerMove(svg, point);
}

describe("Wordmark", () => {
  it("hides itself from assistive tech, being decorative", () => {
    expect(renderMark().getAttribute("aria-hidden")).toBe("true");
  });

  it("draws the three primitives of the mark", () => {
    const { container } = render(<Wordmark />);
    expect(container.querySelector(".wordmark__disc")).toBeTruthy();
    expect(container.querySelector(".wordmark__quarter")).toBeTruthy();
    expect(container.querySelector(".wordmark__square")).toBeTruthy();
  });

  it("draws the core on top of the disc", () => {
    const { container } = render(<Wordmark />);
    expect(container.querySelector(".wordmark__core")).toBeTruthy();
  });

  it("defaults to the size the wordmark is used at", () => {
    const svg = renderMark();
    expect(svg.getAttribute("width")).toBe("36");
    expect(svg.getAttribute("height")).toBe("36");
  });

  it("takes a size when asked for a different one", () => {
    const svg = renderMark(64);
    expect(svg.getAttribute("width")).toBe("64");
    expect(svg.getAttribute("height")).toBe("64");
  });

  it("keeps its proportions whatever the size", () => {
    expect(renderMark().getAttribute("viewBox")).toBe("0 0 36 36");
  });

  it("rests flat while the pointer is elsewhere", () => {
    const svg = renderMark();
    expect(liftOf(svg, "disc")).toBe(0);
    expect(liftOf(svg, "quarter")).toBe(0);
    expect(liftOf(svg, "core")).toBe(0);
  });

  it("lifts the disc most when the pointer is over the centre", () => {
    const svg = renderMark();
    withBox(svg, { left: 0, top: 0, width: 100, height: 100 });

    hover(svg, { clientX: 50, clientY: 50 });

    expect(liftOf(svg, "disc")).toBeCloseTo(1);
  });

  it("gives the core a tighter falloff than the disc, so it settles first", () => {
    const svg = renderMark();
    withBox(svg, { left: 0, top: 0, width: 100, height: 100 });

    // Half way out, which is past the core's radius but inside the disc's. The
    // core is the detail on top of the larger shape, so it has to land before it.
    hover(svg, { clientX: 100, clientY: 50 });

    expect(liftOf(svg, "core")).toBe(0);
    expect(liftOf(svg, "disc")).toBeGreaterThan(0);
  });

  it("ties the core and the disc when the pointer is dead centre", () => {
    const svg = renderMark();
    withBox(svg, { left: 0, top: 0, width: 100, height: 100 });

    hover(svg, { clientX: 50, clientY: 50 });

    expect(liftOf(svg, "core")).toBe(1);
    expect(liftOf(svg, "disc")).toBe(1);
  });

  it("lifts the quarter when the pointer is over its corner", () => {
    const svg = renderMark();
    withBox(svg, { left: 0, top: 0, width: 100, height: 100 });

    hover(svg, { clientX: 8, clientY: 8 });

    expect(liftOf(svg, "quarter")).toBeGreaterThan(0);
    expect(liftOf(svg, "quarter")).toBeGreaterThan(liftOf(svg, "disc"));
  });

  it("never lifts anything when the pointer is past the edge of the mark", () => {
    const svg = renderMark();
    withBox(svg, { left: 0, top: 0, width: 100, height: 100 });

    hover(svg, { clientX: 400, clientY: 400 });

    expect(liftOf(svg, "disc")).toBe(0);
    expect(liftOf(svg, "quarter")).toBe(0);
    expect(liftOf(svg, "core")).toBe(0);
  });

  it("clamps a pointer outside the box instead of lifting it backwards", () => {
    const svg = renderMark();
    withBox(svg, { left: 0, top: 0, width: 100, height: 100 });

    hover(svg, { clientX: -500, clientY: -500 });

    expect(liftOf(svg, "disc")).toBe(0);
  });

  it("tracks the pointer as it moves across the mark", () => {
    const svg = renderMark();
    withBox(svg, { left: 0, top: 0, width: 100, height: 100 });

    hover(svg, { clientX: 50, clientY: 50 });
    const atCentre = liftOf(svg, "disc");

    hover(svg, { clientX: 5, clientY: 5 });

    expect(liftOf(svg, "disc")).toBeLessThan(atCentre);
  });

  it("settles back when the pointer leaves", () => {
    const svg = renderMark();
    withBox(svg, { left: 0, top: 0, width: 100, height: 100 });

    hover(svg, { clientX: 50, clientY: 50 });
    fireEvent.pointerLeave(svg);

    expect(liftOf(svg, "disc")).toBe(0);
    expect(liftOf(svg, "quarter")).toBe(0);
    expect(liftOf(svg, "core")).toBe(0);
  });

  it("lifts on enter as well as on move, so a tap that lands without moving reads", () => {
    const svg = renderMark();
    withBox(svg, { left: 0, top: 0, width: 100, height: 100 });

    fireEvent.pointerEnter(svg, { clientX: 50, clientY: 50 });

    expect(liftOf(svg, "disc")).toBeCloseTo(1);
  });

  it("survives a pointer event on a box jsdom reports as zero sized", () => {
    const svg = renderMark();

    hover(svg, { clientX: 10, clientY: 10 });

    expect(liftOf(svg, "disc")).toBe(0);
  });
});