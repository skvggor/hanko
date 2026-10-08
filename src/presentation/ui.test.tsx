import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Button,
  Chip,
  Label,
  Meter,
  OwnerBadge,
  Panel,
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
});

describe("OwnerBadge", () => {
  it("shows the label it is given", () => {
    render(<OwnerBadge label="Owner" />);
    expect(screen.getByText("Owner")).toBeTruthy();
  });

  it("exposes the owner role to tests and to CSS", () => {
    const { container } = render(<OwnerBadge label="Owner" />);
    expect(container.querySelector('[data-role="owner"]')).toBeTruthy();
  });

  it("hides the disc from assistive tech, since the label already says it", () => {
    const { container } = render(<OwnerBadge label="Owner" />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("paints two discs so ownership reads as a shape", () => {
    const { container } = render(<OwnerBadge label="Owner" />);
    expect(container.querySelectorAll("svg circle")).toHaveLength(2);
  });
});

describe("Meter", () => {
  it("reads as a progressbar", () => {
    render(<Meter value={0.5} label="Half the room has voted" />);
    expect(screen.getByRole("progressbar", { name: "Half the room has voted" })).toBeTruthy();
  });

  it("reports the rounded percentage through aria-valuenow", () => {
    render(<Meter value={0.5} label="voted" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
  });

  it("spans the full scale", () => {
    render(<Meter value={0.5} label="voted" />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
  });

  it("sizes the fill to the value", () => {
    render(<Meter value={0.25} label="voted" />);
    const fill = screen.getByRole("progressbar").firstElementChild;
    expect(fill?.getAttribute("style")).toContain("width: 25%");
  });

  it("rounds a value that does not land on a whole percent", () => {
    render(<Meter value={1 / 3} label="voted" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("33");
  });

  it("clamps a value above one, which would otherwise overflow the track", () => {
    render(<Meter value={1.5} label="voted" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });

  it("clamps a negative value to an empty track", () => {
    render(<Meter value={-0.5} label="voted" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
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
    expect(screen.getByRole("progressbar").firstElementChild?.className).toContain(
      "bg-secondary",
    );
  });

  it("fills with the primary tone on request", () => {
    render(<Meter value={0.5} label="voted" tone="primary" />);
    expect(screen.getByRole("progressbar").firstElementChild?.className).toContain(
      "bg-primary",
    );
  });
});