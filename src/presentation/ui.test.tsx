import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Button,
  Chip,
  Label,
  Meter,
  OwnerName,
  Panel,
  Tooltip,
} from "@presentation/ui";

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Reveal</Button>);
    expect(screen.getByRole("button", { name: "Reveal" })).toBeTruthy();
  });

  it("defaults to type button so it never submits a form by accident", () => {
    render(<Button>Reveal</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("can be turned into a submit button on request", () => {
    render(<Button type="submit">Enter</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("submit");
  });

  it("calls onClick when pressed", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Reveal</Button>);

    await userEvent.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick while disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Reveal
      </Button>,
    );

    await userEvent.click(screen.getByRole("button"));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("marks itself disabled for assistive tech", () => {
    render(<Button disabled>Reveal</Button>);
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  });

  it("fades a control that is merely unavailable", () => {
    render(<Button disabled>Reveal</Button>);
    expect(screen.getByRole("button").className).toContain("disabled:opacity-40");
  });

  it("stays legible while it is working rather than looking unavailable", () => {
    render(<Button busy>Reveal</Button>);
    expect(screen.getByRole("button").className).not.toContain("disabled:opacity-40");
  });

  it("shows work happening with a spinner", () => {
    const { container } = render(<Button busy>Reveal</Button>);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("carries no spinner when it is idle", () => {
    const { container } = render(<Button>Reveal</Button>);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("cannot be pressed a second time while it is working", () => {
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Reveal
      </Button>,
    );

    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);

    return userEvent.click(screen.getByRole("button")).then(() => {
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  it("marks itself busy for assistive tech", () => {
    render(<Button busy>Reveal</Button>);
    expect(screen.getByRole("button").getAttribute("aria-busy")).toBe("true");
  });

  it("leaves aria-busy off when it is idle", () => {
    render(<Button>Reveal</Button>);
    expect(screen.getByRole("button").hasAttribute("aria-busy")).toBe(false);
  });

  it("keeps a minimum touch target", () => {
    render(<Button>Reveal</Button>);
    expect(screen.getByRole("button").className).toContain("min-h-11");
  });

  it("wears the primary variant on request", () => {
    render(<Button variant="primary">Reveal</Button>);
    expect(screen.getByRole("button").className).toContain("bg-primary");
  });

  it("wears the danger variant on request", () => {
    render(<Button variant="danger">Delete room</Button>);
    expect(screen.getByRole("button").className).toContain("text-primary");
  });

  it("wears the quiet variant on request", () => {
    render(<Button variant="quiet">Back</Button>);
    expect(screen.getByRole("button").className).toContain("border-transparent");
  });

  it("falls back to the default variant", () => {
    render(<Button>Reveal</Button>);
    expect(screen.getByRole("button").className).toContain("border-ink/30");
  });

  it("appends a caller class without dropping its own", () => {
    render(<Button className="w-full">Reveal</Button>);
    const className = screen.getByRole("button").className;
    expect(className).toContain("w-full");
    expect(className).toContain("min-h-11");
  });
});

describe("Panel", () => {
  it("renders its children inside a section", () => {
    const { container } = render(<Panel>inside</Panel>);
    expect(container.querySelector("section")?.textContent).toBe("inside");
  });

  it("stays out of the accessibility tree until it is named", () => {
    render(<Panel>inside</Panel>);
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("becomes a landmark once a label names it", () => {
    render(<Panel aria-label="Share">inside</Panel>);
    expect(screen.getByRole("region", { name: "Share" })).toBeTruthy();
  });

  it("appends a caller class", () => {
    const { container } = render(<Panel className="mt-4">inside</Panel>);
    expect(container.querySelector("section")?.className).toContain("mt-4");
  });

  it("keeps its own surface classes alongside the caller class", () => {
    const { container } = render(<Panel className="mt-4">inside</Panel>);
    expect(container.querySelector("section")?.className).toContain("bg-paper-raised");
  });

  it("forwards native attributes to the section", () => {
    render(<Panel id="share-panel" aria-label="Share">inside</Panel>);
    expect(screen.getByLabelText("Share").getAttribute("id")).toBe("share-panel");
  });
});

describe("Label", () => {
  it("renders its children", () => {
    render(<Label>Session name</Label>);
    expect(screen.getByText("Session name")).toBeTruthy();
  });

  it("is a paragraph, so it does not interrupt the surrounding prose", () => {
    const { container } = render(<Label>Session name</Label>);
    expect(container.querySelector("p")).toBeTruthy();
  });

  it("is uppercased by the design system rather than by its caller", () => {
    render(<Label>Session name</Label>);
    expect(screen.getByText("Session name").className).toContain("uppercase");
  });
});

describe("Chip", () => {
  it("renders its children", () => {
    render(<Chip>2 watching</Chip>);
    expect(screen.getByText("2 watching")).toBeTruthy();
  });

  it("falls back to the neutral tone", () => {
    render(<Chip>2 watching</Chip>);
    expect(screen.getByText("2 watching").className).toContain("bg-ink/8");
  });

  it("wears the primary tone on request", () => {
    render(<Chip tone="primary">You</Chip>);
    expect(screen.getByText("You").className).toContain("text-primary");
  });

  it("wears the secondary tone on request", () => {
    render(<Chip tone="secondary">Owner</Chip>);
    expect(screen.getByText("Owner").className).toContain("text-secondary");
  });

  it("wears the accent tone on request", () => {
    render(<Chip tone="accent">Round 2</Chip>);
    expect(screen.getByText("Round 2").className).toContain("bg-accent/30");
  });

  it("carries a title when one is given", () => {
    render(<Chip title="Voting">3</Chip>);
    expect(screen.getByTitle("Voting").textContent).toBe("3");
  });

  it("has no title when none is given", () => {
    render(<Chip>3</Chip>);
    expect(screen.getByText("3").hasAttribute("title")).toBe(false);
  });

  it("keeps its label on one line and never squashes", () => {
    render(<Chip>Waiting for the owner to reveal</Chip>);
    const chip = screen.getByText("Waiting for the owner to reveal");

    expect(chip.className).toContain("whitespace-nowrap");
    expect(chip.className).toContain("shrink-0");
  });
});

describe("OwnerName", () => {
  it("shows the name it is given", () => {
    render(<OwnerName name="Ana" roleLabel="Owner" stamp={vi.fn()} />);
    expect(screen.getByText("Ana")).toBeTruthy();
  });

  it("says the role in words", () => {
    render(<OwnerName name="Ana" roleLabel="Owner" stamp={vi.fn()} />);
    expect(screen.getByText("Owner")).toBeTruthy();
  });

  it("exposes the owner role to tests and to CSS", () => {
    render(<OwnerName name="Ana" roleLabel="Owner" stamp={vi.fn()} />);
    expect(document.querySelector('[data-role="owner"]')).toBeTruthy();
  });

  it("wears the gold of the owner", () => {
    render(<OwnerName name="Ana" roleLabel="Owner" stamp={vi.fn()} />);
    expect(document.querySelector('[data-role="owner"]')?.className).toContain(
      "accent-deep",
    );
  });

  it("glints in the light without saying so to assistive tech", () => {
    render(<OwnerName name="Ana" roleLabel="Owner" stamp={vi.fn()} />);
    const glint = document.querySelector(".gold-glint");

    expect(glint).toBeTruthy();
    expect(glint?.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps the glint inside the name", () => {
    render(<OwnerName name="Ana" roleLabel="Owner" stamp={vi.fn()} />);
    const box = document.querySelector(".gold-glint")?.parentElement;

    expect(box?.className).toContain("truncate");
    expect(box?.className).toContain("block");
  });

  it("settles the bloom away when nothing moves it", () => {
    render(<OwnerName name="Ana" roleLabel="Owner" stamp={vi.fn()} />);
    const bloom = document.querySelector('[data-role="owner"] span[aria-hidden="true"]');

    expect(bloom?.className).toContain("opacity-0");
  });

  it("stamps the name when it appears", () => {
    const stamp = vi.fn();
    render(<OwnerName name="Ana" roleLabel="Owner" stamp={stamp} />);
    expect(stamp).toHaveBeenCalledTimes(1);
  });
});

describe("Meter", () => {
  it("reads as a progressbar", () => {
    render(<Meter value={0.5} label="Half the room has voted" />);
    expect(screen.getByRole("progressbar", { name: "Half the room has voted" })).toBeTruthy();
  });

  it("is a native progress element", () => {
    render(<Meter value={0.5} label="voted" />);
    expect(screen.getByRole("progressbar").tagName).toBe("PROGRESS");
  });

  it("reports the rounded percentage as its value", () => {
    render(<Meter value={0.5} label="voted" />);
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("50");
  });

  it("spans the full scale", () => {
    render(<Meter value={0.5} label="voted" />);
    expect(screen.getByRole("progressbar").getAttribute("max")).toBe("100");
  });

  it("rounds a value that does not land on a whole percent", () => {
    render(<Meter value={1 / 3} label="voted" />);
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("33");
  });

  it("clamps a value above one, which would otherwise overflow the track", () => {
    render(<Meter value={1.5} label="voted" />);
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("100");
  });

  it("clamps a negative value to an empty track", () => {
    render(<Meter value={-0.5} label="voted" />);
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("0");
  });

  it("is settled by default, so it does not pulse", () => {
    const { container } = render(<Meter value={0.5} label="voted" />);
    const bar = container.querySelector('[data-pending="false"]');
    expect(bar?.className).not.toContain("meter-live");
  });

  it("pulses while people are still out", () => {
    const { container } = render(<Meter value={0.5} label="voted" pending />);
    const bar = container.querySelector('[data-pending="true"]');
    expect(bar?.className).toContain("meter-live");
  });

  it("sweeps a highlight across the track only while it pulses", () => {
    const { container } = render(<Meter value={0.5} label="voted" pending />);
    expect(container.querySelector(".meter-sweep")).toBeTruthy();
  });

  it("has nothing to sweep once it settles", () => {
    const { container } = render(<Meter value={1} label="voted" />);
    expect(container.querySelector(".meter-sweep")).toBeNull();
  });

  it("fills with the secondary tone by default", () => {
    render(<Meter value={0.5} label="voted" />);
    const bar = screen.getByRole("progressbar");
    expect(bar.className).toContain("meter");
    expect(bar.className).not.toContain("meter--primary");
  });

  it("fills with the primary tone on request", () => {
    render(<Meter value={0.5} label="voted" tone="primary" />);
    expect(screen.getByRole("progressbar").className).toContain("meter--primary");
  });
});

describe("Tooltip", () => {
  function renderTip() {
    render(
      <>
        <Tooltip label="Remove">
          <button type="button">go</button>
        </Tooltip>
        <button type="button">after</button>
      </>,
    );
  }

  it("says nothing until it is asked", () => {
    renderTip();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("reveals the label when the pointer rests on it", async () => {
    renderTip();
    await userEvent.hover(screen.getByRole("button", { name: "go" }));
    expect(screen.getByRole("tooltip").textContent).toBe("Remove");
  });

  it("takes the label away when the pointer leaves", async () => {
    renderTip();
    await userEvent.hover(screen.getByRole("button", { name: "go" }));
    await userEvent.unhover(screen.getByRole("button", { name: "go" }));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("reveals the label when the keyboard reaches it", async () => {
    renderTip();
    await userEvent.tab();
    expect(screen.getByRole("tooltip").textContent).toBe("Remove");
  });

  it("takes the label away when the focus moves on", async () => {
    renderTip();
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  /**
   * Some of these are pinned to a corner of the room rather than sitting in a row, and
   * the thing that carries the position has to be the wrapper the label hangs off. The
   * alternative was the button being fixed and the wrapper left behind it in the flow,
   * which works by accident until the markup around it changes.
   */
  /**
   * Centring the label is right for a button sitting in a row and wrong for one pinned
   * to the edge of the window, where the same sentence grows straight off the screen.
   * Whitespace is not wrapped, so there is nothing to save a long label but choosing
   * the end it hangs from.
   */
  it("centres the label by default", async () => {
    renderTip();
    await userEvent.hover(screen.getByRole("button", { name: "go" }));

    expect(screen.getByRole("tooltip").className).toContain("-translate-x-1/2");
  });

  it("hangs the label off the other end when it is told to", async () => {
    render(
      <Tooltip label="Espantar os gatos de todos para as bordas" placement="above-end">
        <button type="button">go</button>
      </Tooltip>,
    );
    await userEvent.hover(screen.getByRole("button", { name: "go" }));

    const label = screen.getByRole("tooltip");
    expect(label.className).toContain("right-0");
    expect(label.className).not.toContain("-translate-x-1/2");
  });

  it("lets the caller place the tooltip", () => {
    const { container } = render(
      <Tooltip className="pinned" label="Remove">
        <button type="button">go</button>
      </Tooltip>,
    );

    expect(container.querySelector(".pinned")).toBeTruthy();
  });
});
