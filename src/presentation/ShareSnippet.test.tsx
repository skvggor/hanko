import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareSnippet } from "@presentation/ShareSnippet";
import { Wordmark } from "@presentation/Wordmark";

function chip(name = "Copy link"): HTMLElement {
  return screen.getByRole("button", { name });
}

function renderSnippet(overrides: Partial<Parameters<typeof ShareSnippet>[0]> = {}) {
  const onCopy = vi.fn();
  render(
    <ShareSnippet
      copied={false}
      copiedLabel="Copied"
      copyLabel="Copy link"
      label="share"
      onCopy={onCopy}
      url="https://hanko.skvggor.workers.dev/room/room-1"
      {...overrides}
    />,
  );
  return onCopy;
}

describe("ShareSnippet", () => {
  it("drops the scheme so the host reads as the subject", () => {
    renderSnippet();
    expect(screen.getByText("hanko.skvggor.workers.dev")).toBeTruthy();
  });

  it("never doubles the slash", () => {
    renderSnippet();
    expect(screen.getByText("/room/")).toBeTruthy();
    expect(screen.getByText("room-1")).toBeTruthy();
    expect(screen.queryByText("//")).toBeNull();
  });

  it("renders the whole link with a single separator", () => {
    renderSnippet();
    expect(chip().textContent).toContain("hanko.skvggor.workers.dev/room/room-1");
  });

  it("does not repeat the scheme anywhere", () => {
    renderSnippet();
    expect(screen.queryByText(/https:\/\//)).toBeNull();
  });

  it("labels the snippet", () => {
    renderSnippet();
    expect(screen.getByText("share")).toBeTruthy();
  });

  it("copies when the chip is clicked", async () => {
    const onCopy = renderSnippet();

    await userEvent.click(chip());

    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it("is one chip, not a field plus a button", () => {
    renderSnippet();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("carries the copy affordance inside the chip", () => {
    renderSnippet();
    expect(chip().querySelector("svg")).not.toBeNull();
  });

  it("flips the chip when the link is copied", () => {
    renderSnippet({ copied: true });
    expect(chip("Copied").getAttribute("data-copied")).toBe("true");
  });

  it("is the button itself, not a field wrapped in a button", () => {
    renderSnippet();
    expect(chip().tagName).toBe("BUTTON");
    expect(chip().getAttribute("type")).toBe("button");
  });

  it("asks for the confirm label once copied", () => {
    renderSnippet({ copied: true });
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("handles a url with no path", () => {
    expect(() => renderSnippet({ url: "https://hanko.skvggor.workers.dev" })).not.toThrow();
    expect(screen.getByText("hanko.skvggor.workers.dev")).toBeTruthy();
  });

  it("survives an empty url", () => {
    expect(() => renderSnippet({ url: "" })).not.toThrow();
  });
});

/*
 * Asserted through the class the chip wears rather than the stylesheet, because
 * jsdom runs no animation. A character level warp was the other candidate and it costs
 * a WebGL renderer, a frame loop and a link a screen reader cannot read as a link.
 */
describe("ShareSnippet copy feedback", () => {
  it("stamps the chip while the copy is confirmed", () => {
    renderSnippet({ copied: true });
    expect(chip("Copied").className).toContain("copy-stamp");
  });

  it("leaves the chip unstamped while nothing is copied", () => {
    renderSnippet();
    expect(chip().className).not.toContain("copy-stamp");
  });

  /* `hover:bg-ink` in a shared list ties with `hover:bg-accent`, and the pointer is
     still resting on the chip it just clicked. */
  it("keeps the copied palette from colliding with the resting one", () => {
    renderSnippet({ copied: true });
    const classes = chip("Copied").className;

    expect(classes).toContain("bg-accent");
    expect(classes).not.toContain("bg-secondary");
    expect(classes).not.toContain("hover:bg-ink");
  });

  it("keeps the chip off its own width so the link has no shelf in front of it", () => {
    renderSnippet();
    expect(chip().className).not.toMatch(/\bw-\[|\bflex-1\b|\bmargin-l/);
  });
});

describe("Wordmark", () => {
  it("draws three primitives", () => {
    const { container } = render(<Wordmark />);
    expect(container.querySelectorAll(".wordmark__square")).toHaveLength(1);
    expect(container.querySelectorAll(".wordmark__disc")).toHaveLength(1);
    expect(container.querySelectorAll(".wordmark__quarter")).toHaveLength(1);
    expect(container.querySelectorAll(".wordmark__core")).toHaveLength(1);
  });

  it("is hidden from screen readers", () => {
    const { container } = render(<Wordmark />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("rests with no pointer influence", () => {
    const { container } = render(<Wordmark />);
    const svg = container.querySelector("svg");

    expect(svg?.style.getPropertyValue("--lift-disc")).toBe("0");
  });

  it("lifts the primitives as the pointer crosses", () => {
    const { container } = render(<Wordmark />);
    const svg = container.querySelector("svg");
    if (svg === null) throw new Error("no wordmark");

    svg.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 20, clientY: 20, bubbles: true }),
    );

    expect(svg.style.getPropertyValue("--lift-disc")).not.toBe("");
  });

  it("settles back when the pointer leaves", () => {
    const { container } = render(<Wordmark />);
    const svg = container.querySelector("svg");
    if (svg === null) throw new Error("no wordmark");

    svg.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 20, clientY: 20, bubbles: true }),
    );
    svg.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));

    expect(svg.style.getPropertyValue("--lift-disc")).toBe("0");
  });
});
