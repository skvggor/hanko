import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Landing } from "@presentation/Landing";
import { BrandMark } from "@presentation/Signature";
import { createTranslator } from "@application/i18n";
import { MINIMUM_PENDING_MS } from "@application/minimumPending";

const translate = createTranslator("en-US");

const harness = vi.hoisted(() => ({
  outcome: "ok",
}));

vi.mock("@application/createRoom", () => ({
  CreateRoomError: class CreateRoomError extends Error {
    constructor(readonly reason: string) {
      super(reason);
      this.name = "CreateRoomError";
    }
  },
  createRoom: async () => {
    if (harness.outcome === "throw") {
      throw new (await import("@application/createRoom")).CreateRoomError("network");
    }
    return "abcd2345";
  },
}));

describe("Landing", () => {
  beforeEach(() => {
    harness.outcome = "ok";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers to start a room", () => {
    render(<Landing onNavigate={vi.fn()} translate={translate} />);
    expect(screen.getByRole("button", { name: "Start a room" })).toBeTruthy();
  });

  it("navigates to the created room", async () => {
    const onNavigate = vi.fn();
    render(<Landing onNavigate={onNavigate} translate={translate} />);

    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith("/room/abcd2345");
    });
  });

  it("shows a creating state while it works", async () => {
    render(<Landing onNavigate={vi.fn()} translate={translate} />);

    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));

    const button = await screen.findByRole("button", { name: "Creating..." });
    // The disabled button is the whole of the double click protection, because a room
    // is a Durable Object and creating a second one is not free.
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("marks the button as working rather than unavailable", async () => {
    render(<Landing onNavigate={vi.fn()} translate={translate} />);

    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));

    const button = await screen.findByRole("button", { name: "Creating..." });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.className).not.toContain("disabled:opacity-40");
  });

  it("holds the creating state long enough for anyone to see it", async () => {
    const onNavigate = vi.fn();
    render(<Landing onNavigate={onNavigate} translate={translate} />);

    const clickedAt = Date.now();
    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));

    expect(onNavigate).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith("/room/abcd2345");
    });

    expect(Date.now() - clickedAt).toBeGreaterThanOrEqual(MINIMUM_PENDING_MS);
  });


  it("reports a failure and stays on the page", async () => {
    harness.outcome = "throw";
    const onNavigate = vi.fn();

    render(<Landing onNavigate={onNavigate} translate={translate} />);
    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));

    expect(
      await screen.findByText("Could not create the room. Check your connection."),
    ).toBeTruthy();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("allows retrying after a failure", async () => {
    harness.outcome = "throw";
    render(<Landing onNavigate={vi.fn()} translate={translate} />);

    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));
    await screen.findByRole("alert");

    harness.outcome = "ok";
    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  it("renders in portuguese", () => {
    render(
      <Landing
        onNavigate={vi.fn()}
        translate={createTranslator("pt-BR")}
      />,
    );
    expect(screen.getByRole("button", { name: "Criar sala" })).toBeTruthy();
    expect(
      screen.getByText("Crie uma sala e compartilhe o link."),
    ).toBeTruthy();
  });

  it("puts the mark and the name above the call to action", () => {
    const { container } = render(<Landing onNavigate={vi.fn()} translate={translate} />);
    const mark = container.querySelector("[data-ring='top']");
    const heading = screen.getByRole("heading", { level: 1 });
    const button = screen.getByRole("button", { name: "Start a room" });
    if (!mark) throw new Error("the home screen does not carry the mark");

    expect(mark.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(heading.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("sets the name and the tagline the way the chrome does", () => {
    const { container: home } = render(<Landing onNavigate={vi.fn()} translate={translate} />);
    const { container: chrome } = render(<BrandMark translate={translate} />);

    expect(home.querySelector("h1")?.className).toBe(chrome.querySelector("h1")?.className);
    expect(home.querySelector("p")?.className).toBe(chrome.querySelector("p")?.className);
  });

  it("carries the tagline under the name", () => {
    render(<Landing onNavigate={vi.fn()} translate={translate} />);

    expect(screen.getByText("Your team's consensus.")).toBeTruthy();
  });
});