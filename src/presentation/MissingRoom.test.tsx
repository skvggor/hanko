import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MissingRoom } from "@presentation/MissingRoom";
import { createTranslator } from "@application/i18n";
import { MINIMUM_PENDING_MS } from "@application/minimumPending";

const translate = createTranslator("en-US");

const harness = vi.hoisted(() => {
  class CreateRoomError extends Error {
    constructor(readonly reason: string) {
      super(reason);
      this.name = "CreateRoomError";
    }
  }

  return { outcome: "ok", CreateRoomError };
});

vi.mock("@application/createRoom", () => ({
  CreateRoomError: harness.CreateRoomError,
  createRoom: async () => {
    if (harness.outcome === "throw") {
      throw new harness.CreateRoomError("network");
    }
    return "abcd2345";
  },
}));

describe("MissingRoom", () => {
  beforeEach(() => {
    harness.outcome = "ok";
  });

  it("blames the link instead of claiming the room was deleted", () => {
    render(<MissingRoom onNavigate={vi.fn()} translate={translate} />);

    expect(screen.getByRole("heading", { name: "Room not found" })).toBeTruthy();
    expect(screen.getByText("This link isn't a room")).toBeTruthy();
  });

  it("offers to start a room from there", () => {
    render(<MissingRoom onNavigate={vi.fn()} translate={translate} />);

    expect(screen.getByRole("button", { name: "Start a room" })).toBeTruthy();
  });

  it("navigates to the room it just created", async () => {
    const onNavigate = vi.fn();
    render(<MissingRoom onNavigate={onNavigate} translate={translate} />);

    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith("/room/abcd2345");
    });
  });

  it("shows a creating state while it works", async () => {
    render(<MissingRoom onNavigate={vi.fn()} translate={translate} />);

    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));

    const button = await screen.findByRole("button", { name: "Creating..." });
    // The disabled button is the whole of the double click protection, because a room
    // is a Durable Object and creating a second one is not free.
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("marks the button as working rather than unavailable", async () => {
    render(<MissingRoom onNavigate={vi.fn()} translate={translate} />);

    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));

    const button = await screen.findByRole("button", { name: "Creating..." });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.className).not.toContain("disabled:opacity-40");
  });

  it("holds the creating state long enough for anyone to see it", async () => {
    const onNavigate = vi.fn();
    render(<MissingRoom onNavigate={onNavigate} translate={translate} />);

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
    render(<MissingRoom onNavigate={onNavigate} translate={translate} />);

    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));

    expect(
      await screen.findByText("Could not create the room. Check your connection."),
    ).toBeTruthy();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("unlocks the button after a failure", async () => {
    harness.outcome = "throw";
    render(<MissingRoom onNavigate={vi.fn()} translate={translate} />);

    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));
    await screen.findByRole("alert");

    expect(screen.getByRole("button", { name: "Start a room" }).hasAttribute("disabled")).toBe(false);
  });

  it("clears the failure when the retry succeeds", async () => {
    harness.outcome = "throw";
    const onNavigate = vi.fn();
    render(<MissingRoom onNavigate={onNavigate} translate={translate} />);

    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));
    await screen.findByRole("alert");

    harness.outcome = "ok";
    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith("/room/abcd2345");
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders in portuguese", () => {
    render(
      <MissingRoom onNavigate={vi.fn()} translate={createTranslator("pt-BR")} />,
    );

    expect(screen.getByRole("button", { name: "Criar sala" })).toBeTruthy();
    expect(screen.getByText("Este link não é uma sala")).toBeTruthy();
  });
});
