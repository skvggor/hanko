import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator } from "@application/i18n";
import { CatControls } from "@presentation/CatControls";

const translate = createTranslator("en-US");

function renderControls(
  props: Partial<React.ComponentProps<typeof CatControls>> = {},
): { onRemove: () => void; onTogglePause: () => void } {
  const onRemove = vi.fn();
  const onTogglePause = vi.fn();

  render(
    <CatControls
      isOwn
      isPaused={false}
      name="Ana"
      onRemove={onRemove}
      onTogglePause={onTogglePause}
      translate={translate}
      {...props}
    />,
  );

  return { onRemove, onTogglePause };
}

describe("CatControls", () => {
  it("names the pause button after the cat it acts on", () => {
    renderControls();

    // A raw {{name}} reaching the accessible name is a template that never resolved,
    // which is what a screen reader ends up reading out loud.
    expect(screen.getByRole("button", { name: "Pause Ana's cat" })).toBeTruthy();
  });

  it("names the resume button after the cat it acts on", () => {
    renderControls({ isPaused: true });

    expect(screen.getByRole("button", { name: "Resume Ana's cat" })).toBeTruthy();
  });

  it("leaves no unresolved placeholder in either button", () => {
    renderControls();

    for (const button of screen.getAllByRole("button")) {
      expect(button.getAttribute("aria-label") ?? "").not.toContain("{{");
    }
  });

  it("pauses when asked", async () => {
    const { onTogglePause } = renderControls();

    await userEvent.click(screen.getByRole("button", { name: "Pause Ana's cat" }));

    expect(onTogglePause).toHaveBeenCalledTimes(1);
  });

  it("resumes when asked", async () => {
    const { onTogglePause } = renderControls({ isPaused: true });

    await userEvent.click(screen.getByRole("button", { name: "Resume Ana's cat" }));

    expect(onTogglePause).toHaveBeenCalledTimes(1);
  });

  it("removes the cat when asked", async () => {
    const { onRemove } = renderControls();

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("shows no controls on someone else's cat", () => {
    renderControls({ isOwn: false });

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("exposes the pair as a toolbar", () => {
    renderControls();

    expect(screen.getByRole("toolbar", { name: "Cat controls" })).toBeTruthy();
  });
});