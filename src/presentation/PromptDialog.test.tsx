import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PromptDialog } from "@presentation/PromptDialog";

function open(
  overrides: Partial<React.ComponentProps<typeof PromptDialog>> = {},
): { onAccept: (value: string) => void; onCancel: () => void } {
  const onAccept = vi.fn();
  const onCancel = vi.fn();

  render(
    <PromptDialog
      acceptLabel="Save"
      cancelLabel="Cancel"
      initialValue="Planning poker"
      label="Session name"
      title="Name this session"
      validate={() => null}
      onAccept={onAccept}
      onCancel={onCancel}
      {...overrides}
    />,
  );

  return { onAccept, onCancel };
}

describe("PromptDialog", () => {
  it("opens focused on the field with what was there ready to be replaced", () => {
    open();

    expect(document.activeElement).toBe(screen.getByLabelText("Session name"));
    expect(screen.getByLabelText("Session name")).toHaveValue("Planning poker");
  });

  it("hands over what was typed", async () => {
    const { onAccept } = open();

    const field = screen.getByLabelText("Session name");
    await userEvent.clear(field);
    await userEvent.type(field, "Estimativas");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onAccept).toHaveBeenCalledWith("Estimativas");
  });

  it("hands over on enter, the way a field is expected to", async () => {
    const { onAccept } = open();

    await userEvent.type(screen.getByLabelText("Session name"), "{Enter}");

    expect(onAccept).toHaveBeenCalledWith("Planning poker");
  });

  /**
   * The dialog stays open and says why, rather than closing on a value the room will
   * refuse. Closing would throw away the rest of what was typed along with the reason.
   */
  it("stays open and explains itself when the value is refused", async () => {
    const { onAccept } = open({ validate: () => "That name cannot be used" });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onAccept).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("That name cannot be used");
  });

  it("clears the complaint as soon as the value changes", async () => {
    open({
      // Refuses the name the dialog opened with, so the complaint is on screen.
      validate: (value: string) =>
        value.length === "Planning poker".length ? "Give it a name" : null,
    });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toBeTruthy();

    await userEvent.type(screen.getByLabelText("Session name"), "!");

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("cancels without handing anything over", async () => {
    const { onAccept, onCancel } = open();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("cancels on escape", () => {
    const { onCancel } = open();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});