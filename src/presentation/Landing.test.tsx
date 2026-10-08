import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Landing } from "@presentation/Landing";
import { createTranslator } from "@application/i18n";

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

    await screen.findByRole("button", { name: "Creating..." });
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
});