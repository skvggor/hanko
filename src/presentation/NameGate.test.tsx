import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NameGate } from "@presentation/NameGate";
import { createTranslator } from "@application/i18n";

const translate = createTranslator("en-US");

describe("NameGate", () => {
  beforeEach(() => {
    vi.stubGlobal("prompt", vi.fn(() => "Ana"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks for a name", () => {
    render(<NameGate onJoin={vi.fn()} suggestedName={null} translate={translate} />);
    expect(screen.getByText("What is your name?")).toBeTruthy();
  });

  it("disables submit while the name is empty", () => {
    render(<NameGate onJoin={vi.fn()} suggestedName={null} translate={translate} />);
    expect(screen.getByRole("button", { name: "Enter" }).hasAttribute("disabled")).toBe(true);
  });

  it("enables submit once a name is typed", async () => {
    render(<NameGate onJoin={vi.fn()} suggestedName={null} translate={translate} />);

    await userEvent.type(screen.getByLabelText("Your name"), "Ana");

    expect(screen.getByRole("button", { name: "Enter" }).hasAttribute("disabled")).toBe(false);
  });

  it("submits the trimmed name as a voter", async () => {
    const onJoin = vi.fn();
    render(<NameGate onJoin={onJoin} suggestedName={null} translate={translate} />);

    await userEvent.type(screen.getByLabelText("Your name"), "  Ana  ");
    await userEvent.click(screen.getByRole("button", { name: "Enter" }));

    expect(onJoin).toHaveBeenCalledWith("Ana", "voter");
  });

  it("submits as a spectator when chosen", async () => {
    const onJoin = vi.fn();
    render(<NameGate onJoin={onJoin} suggestedName={null} translate={translate} />);

    await userEvent.type(screen.getByLabelText("Your name"), "Ana");
    await userEvent.click(screen.getByRole("button", { name: "Watch instead" }));
    await userEvent.click(screen.getByRole("button", { name: "Enter" }));

    expect(onJoin).toHaveBeenCalledWith("Ana", "spectator");
  });

  it("defaults to the voter role", () => {
    render(<NameGate onJoin={vi.fn()} suggestedName={null} translate={translate} />);
    const voterRole = screen.getByRole("button", { name: "Join as voter" });
    expect(voterRole.getAttribute("aria-pressed")).toBe("true");
  });

  it("prefills the previously stored name", () => {
    render(<NameGate onJoin={vi.fn()} suggestedName="Ana" translate={translate} />);
    const input: HTMLInputElement = screen.getByLabelText("Your name");
    expect(input.value).toBe("Ana");
  });

  it("lets the returning person keep their stored name", async () => {
    const onJoin = vi.fn();
    render(<NameGate onJoin={onJoin} suggestedName="Ana" translate={translate} />);

    await userEvent.click(screen.getByRole("button", { name: "Enter" }));

    expect(onJoin).toHaveBeenCalledWith("Ana", "voter");
  });

  it("blocks submission for a whitespace only stored name", () => {
    render(<NameGate onJoin={vi.fn()} suggestedName="   " translate={translate} />);

    expect(screen.getByRole("button", { name: "Enter" }).hasAttribute("disabled")).toBe(true);
  });

  it("renders in portuguese", () => {
    render(
      <NameGate
        onJoin={vi.fn()}
        suggestedName={null}
        translate={createTranslator("pt-BR")}
      />,
    );
    expect(screen.getByText("Qual é o seu nome?")).toBeTruthy();
  });

  it("hints the accepted characters", () => {
    render(<NameGate onJoin={vi.fn()} suggestedName={null} translate={translate} />);
    expect(screen.getByText("Letters only. Accents are fine.")).toBeTruthy();
  });
});