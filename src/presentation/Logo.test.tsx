import { fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Logo } from "@presentation/Logo";

const BOX = { left: 0, top: 0, width: 100, height: 100 };

/**
 * jsdom reports a zero sized box for every element, and the pointer maths divides by
 * it, so without this the falloff is untestable.
 */
function withBox(svg: SVGSVGElement, box: typeof BOX): void {
  svg.getBoundingClientRect = () => ({ ...box }) as DOMRect;
}

function part(container: HTMLElement, selector: string): SVGElement {
  const node = container.querySelector<SVGElement>(selector);
  if (!node) throw new Error(`the logo did not render ${selector}`);
  return node;
}

function shiftOf(element: SVGElement, axis: "x" | "y"): number {
  const value = element.style.getPropertyValue(`--shift-${axis}`);
  return value === "" ? 0 : Number(value);
}

function magnitude(element: SVGElement): number {
  return Math.hypot(shiftOf(element, "x"), shiftOf(element, "y"));
}

function number(attribute: string | null): number {
  return Number(attribute ?? 0);
}

function frameOf(svg: SVGSVGElement): { x: number; y: number; width: number; height: number } {
  const [x, y, width, height] = (svg.getAttribute("viewBox") ?? "").trim().split(/\s+/).map(Number);
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    throw new Error("the logo does not declare a viewBox");
  }
  return { x, y, width, height };
}

/** Where a point in the mark's own units lands in the element box the tests drive. */
function over(
  svg: SVGSVGElement,
  point: { x: number; y: number },
): { clientX: number; clientY: number } {
  const frame = frameOf(svg);
  return {
    clientX: BOX.left + ((point.x - frame.x) / frame.width) * BOX.width,
    clientY: BOX.top + ((point.y - frame.y) / frame.height) * BOX.height,
  };
}

/** The upper edge of a ring's band, where the pointer sits on that ring and nothing else. */
function topOfBand(ring: SVGElement): { x: number; y: number } {
  return {
    x: number(ring.getAttribute("cx")),
    y: number(ring.getAttribute("cy")) - number(ring.getAttribute("r")),
  };
}

/** Where the three rings meet, which is the middle of the mark and what the core answers for. */
function meetingPoint(rings: SVGElement[]): { x: number; y: number } {
  const sum = rings.reduce(
    (total, ring) => ({
      x: total.x + number(ring.getAttribute("cx")),
      y: total.y + number(ring.getAttribute("cy")),
    }),
    { x: 0, y: 0 },
  );

  return { x: sum.x / rings.length, y: sum.y / rings.length };
}

/** How far a ring's painted edge sits from the nearest edge of the frame. */
function clearanceOf(
  ring: SVGElement,
  frame: { x: number; y: number; width: number; height: number },
): number {
  const half = number(ring.getAttribute("r")) + number(ring.getAttribute("stroke-width")) / 2;
  const centreX = number(ring.getAttribute("cx"));
  const centreY = number(ring.getAttribute("cy"));

  return Math.min(
    centreX - half - frame.x,
    centreY - half - frame.y,
    frame.x + frame.width - (centreX + half),
    frame.y + frame.height - (centreY + half),
  );
}

function renderMark(className: string) {
  const { container } = render(<Logo className={className} />);
  return {
    container,
    svg: container.querySelector("svg"),
    top: part(container, "[data-ring='top']"),
    left: part(container, "[data-ring='left']"),
    right: part(container, "[data-ring='right']"),
    core: part(container, "[data-core]"),
  };
}

function hover(svg: SVGSVGElement, point: { clientX: number; clientY: number }): void {
  fireEvent.pointerMove(svg, point);
}

describe("Logo", () => {
  it("hides itself from assistive tech, being decorative", () => {
    const { svg } = renderMark("h-7 w-7");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("draws the three rings of the mark", () => {
    const { container } = render(<Logo className="h-7 w-7" />);
    expect(container.querySelectorAll("[data-ring]").length).toBe(3);
  });

  it("draws the shared core after the rings, so the agreement sits on top", () => {
    const { container, core } = renderMark("h-7 w-7");
    const shapes = [...container.querySelectorAll("[data-ring], [data-core]")];

    expect(shapes.at(-1)).toBe(core);
  });

  it("keeps its proportions whatever the size", () => {
    const { svg } = renderMark("h-24 w-24");
    expect(svg?.getAttribute("viewBox")).toBe("-6.93 -8.57 114 114");
  });

  /* Framed by its own bounds the rings sat on the edge of the viewport and the nudge was cut off on the sides. */
  it("frames the mark with room to spare, so the nudge is never cut off", () => {
    const { svg, top, left, right } = renderMark("h-28 w-28");
    if (!svg) throw new Error("the logo did not render an svg");
    const frame = frameOf(svg);

    for (const ring of [top, left, right]) {
      expect(clearanceOf(ring, frame)).toBeGreaterThan(5);
    }
  });

  it("takes the size from the class the caller gives it", () => {
    const { svg } = renderMark("h-24 w-24");
    expect(svg?.getAttribute("class")).toBe("h-24 w-24");
  });

  it("paints with the current colour so the caller owns the tone", () => {
    const { container } = render(<Logo className="h-7 w-7" />);
    for (const shape of container.querySelectorAll("circle, path")) {
      const paint = shape.getAttribute("stroke") ?? shape.getAttribute("fill");
      expect(paint).toBe("currentColor");
    }
  });

  it("rests still while the pointer is elsewhere", () => {
    const { svg, top, left, right, core } = renderMark("h-7 w-7");
    if (!svg) throw new Error("the logo did not render an svg");
    withBox(svg, BOX);

    hover(svg, { clientX: 5, clientY: 5 });

    expect(magnitude(top)).toBe(0);
    expect(magnitude(left)).toBe(0);
    expect(magnitude(right)).toBe(0);
    expect(magnitude(core)).toBe(0);
  });

  it("pushes the ring under the pointer away from it and leaves the others alone", () => {
    const { svg, top, left, right } = renderMark("h-7 w-7");
    if (!svg) throw new Error("the logo did not render an svg");
    withBox(svg, BOX);

    hover(svg, over(svg, topOfBand(top)));

    expect(shiftOf(top, "y")).toBeGreaterThan(0);
    expect(magnitude(left)).toBe(0);
    expect(magnitude(right)).toBe(0);
  });

  it("moves the core before the rings, because it is the one answer they share", () => {
    const { svg, top, left, right, core } = renderMark("h-7 w-7");
    if (!svg) throw new Error("the logo did not render an svg");
    withBox(svg, BOX);

    hover(svg, over(svg, meetingPoint([top, left, right])));

    expect(magnitude(core)).toBeGreaterThan(magnitude(top));
    expect(magnitude(core)).toBeGreaterThan(magnitude(left));
    expect(magnitude(core)).toBeGreaterThan(magnitude(right));
  });

  it("holds still when the pointer lands on a part, since there is no direction to give way in", () => {
    const { svg, top } = renderMark("h-7 w-7");
    if (!svg) throw new Error("the logo did not render an svg");
    withBox(svg, BOX);

    hover(svg, over(svg, { x: number(top.getAttribute("cx")), y: number(top.getAttribute("cy")) }));

    expect(magnitude(top)).toBe(0);
  });

  it("tracks the pointer as it moves across the mark", () => {
    const { svg, top, left, right, core } = renderMark("h-7 w-7");
    if (!svg) throw new Error("the logo did not render an svg");
    withBox(svg, BOX);

    hover(svg, over(svg, meetingPoint([top, left, right])));
    const atCentre = magnitude(core);

    hover(svg, { clientX: 95, clientY: 95 });

    expect(magnitude(core)).toBeLessThan(atCentre);
  });

  it("settles back when the pointer leaves", () => {
    const { svg, top, core } = renderMark("h-7 w-7");
    if (!svg) throw new Error("the logo did not render an svg");
    withBox(svg, BOX);

    hover(svg, over(svg, topOfBand(top)));
    fireEvent.pointerLeave(svg);

    expect(magnitude(top)).toBe(0);
    expect(magnitude(core)).toBe(0);
  });

  it("lifts on enter as well as on move, so a tap that lands without moving reads", () => {
    const { svg, top } = renderMark("h-7 w-7");
    if (!svg) throw new Error("the logo did not render an svg");
    withBox(svg, BOX);

    fireEvent.pointerEnter(svg, over(svg, topOfBand(top)));

    expect(shiftOf(top, "y")).toBeGreaterThan(0);
  });

  it("clamps a pointer outside the box instead of pushing the mark away with it", () => {
    const { svg, top, core } = renderMark("h-7 w-7");
    if (!svg) throw new Error("the logo did not render an svg");
    withBox(svg, BOX);

    hover(svg, { clientX: -500, clientY: -500 });

    expect(magnitude(top)).toBe(0);
    expect(magnitude(core)).toBe(0);
  });

  it("survives a pointer event on a box jsdom reports as zero sized", () => {
    const { svg, top, core } = renderMark("h-7 w-7");
    if (!svg) throw new Error("the logo did not render an svg");

    hover(svg, { clientX: 10, clientY: 10 });

    expect(magnitude(top)).toBe(0);
    expect(magnitude(core)).toBe(0);
  });

  it("gates both the entrance and the hover motion on reduced motion", () => {
    const theme = readFileSync(
      join(process.cwd(), "src/presentation/styles/theme.css"),
      "utf8",
    );

    expect(theme).toContain('[data-reduced-motion="false"] .logo__ring');
    expect(theme).toContain('[data-reduced-motion="true"] .logo__ring');
    expect(theme).toContain('[data-reduced-motion="true"] .logo__core');
  });
});
