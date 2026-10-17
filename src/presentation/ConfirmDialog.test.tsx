import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
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

  it("keeps both answers on one row", () => {
    open();

    const dialog = screen.getByRole("dialog");
    const actions = dialog.querySelector(".confirm-dialog__actions");

    expect(actions?.className).toContain("flex-nowrap");
    expect(screen.getByRole("button", { name: "Keep it" }).className).toContain("px-snug");
    expect(screen.getByRole("button", { name: "Delete room" }).className).toContain("px-snug");
  });

  it("opens even when no element had focus before it", () => {
    const activeElement = vi.spyOn(document, "activeElement", "get").mockReturnValue(null);

    try {
      open();

      expect(screen.getByRole("button", { name: "Keep it" })).toBeTruthy();
    } finally {
      activeElement.mockRestore();
    }
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

  it("returns focus to the control that opened it after cancellation", async () => {
    function ConfirmationHarness() {
      const [isOpen, setIsOpen] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>Open confirmation</button>
          {isOpen && (
            <ConfirmDialog
              acceptLabel="Delete room"
              body="Everyone loses the room."
              cancelLabel="Keep it"
              title="Delete this room?"
              onAccept={() => setIsOpen(false)}
              onCancel={() => setIsOpen(false)}
            />
          )}
        </>
      );
    }

    render(<ConfirmationHarness />);
    const trigger = screen.getByRole("button", { name: "Open confirmation" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));

    expect(document.activeElement).toBe(trigger);
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
