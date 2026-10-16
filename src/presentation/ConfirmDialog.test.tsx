import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "@presentation/ConfirmDialog";

function open(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onAccept = vi.fn();
  const onCancel = vi.fn();

  render(
    <ConfirmDialog
      acceptLabel="Delete room"
      body="Everyone loses the room."
      cancelLabel="Keep it"
      title="Delete this room?"
      onAccept={onAccept}
      onCancel={onCancel}
      {...overrides}
    />,
  );

  return { onAccept, onCancel };
}

describe("ConfirmDialog", () => {
  /**
   * A dialog opened by a stray Enter keypress must not be confirmed by that same
   * keypress, so the focus lands on the answer that does nothing.
   */
  it("opens focused on the safe answer", () => {
    open();

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep it" }));
  });

  it("confirms when the destructive answer is chosen", async () => {
    const { onAccept } = open();

    await userEvent.click(screen.getByRole("button", { name: "Delete room" }));

    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("cancels when the safe answer is chosen", async () => {
    const { onCancel } = open();

    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels on escape", () => {
    const { onCancel } = open();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("ignores the keys it has no answer for", () => {
    const { onAccept, onCancel } = open();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(onAccept).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("stops answering the keyboard once it is gone", () => {
    const removeEventListener = vi.spyOn(document, "removeEventListener");
    const view = render(
      <ConfirmDialog
        acceptLabel="Delete room"
        body="Everyone loses the room."
        cancelLabel="Keep it"
        title="Delete this room?"
        onAccept={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    view.unmount();

    // A listener outliving the dialog would go on cancelling whatever opened next.
    expect(removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
    removeEventListener.mockRestore();
  });

  it("says what is being asked and what will happen", () => {
    open();

    expect(screen.getByRole("heading", { name: "Delete this room?" })).toBeTruthy();
    expect(screen.getByText("Everyone loses the room.")).toBeTruthy();
  });
});