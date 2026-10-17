import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator } from "@application/i18n";
import { CatComposer } from "@presentation/CatComposer";

const translate = createTranslator("en-US");

function renderComposer(
  props: Partial<React.ComponentProps<typeof CatComposer>> = {},
) {
  const onClear = vi.fn();
  const onSend = vi.fn();

  const result = render(
    <CatComposer
      hasMessages={false}
      isOwner={false}
      onClear={onClear}
      onSend={onSend}
      translate={translate}
      {...props}
    />,
  );

  return { onClear, onSend, ...result };
}

describe("CatComposer", () => {
  it("sends the trimmed draft on submit", async () => {
    const { onSend } = renderComposer();

    await userEvent.type(screen.getByRole("textbox"), "oi pessoal");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSend).toHaveBeenCalledWith("oi pessoal");
  });

  it("clears the draft after sending", async () => {
    renderComposer();

    const input = screen.getByRole<HTMLInputElement>("textbox");
    await userEvent.type(input, "oi");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(input.value).toBe("");
  });

  it("keeps send disabled while the draft is blank", () => {
    renderComposer();

    const send = screen.getByRole<HTMLButtonElement>("button", { name: "Send message" });

    expect(send.disabled).toBe(true);
  });

  it("hides the clear button from non-owners", () => {
    renderComposer({ hasMessages: true, isOwner: false });

    expect(screen.queryByRole("button", { name: "Clear the conversation for everyone" })).toBeNull();
  });

  it("hides the clear button when there is nothing to clear", () => {
    renderComposer({ hasMessages: false, isOwner: true });

    expect(screen.queryByRole("button", { name: "Clear the conversation for everyone" })).toBeNull();
  });

  it("lets the owner clear the conversation", async () => {
    const { onClear } = renderComposer({ hasMessages: true, isOwner: true });

    await userEvent.click(
      screen.getByRole("button", { name: "Clear the conversation for everyone" }),
    );

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  /**
   * Every other icon in this room is wrapped in a tooltip, so the one that erases the
   * conversation for everybody was the only one drawn as a bare bin. Nobody can guess
   * from a bin how much of the room it takes with it.
   */
  it("says what clearing reaches while the pointer is on it", async () => {
    renderComposer({ hasMessages: true, isOwner: true });

    expect(screen.queryByRole("tooltip")).toBeNull();

    await userEvent.hover(screen.getByRole("button", { name: /clear the conversation/i }));

    expect(screen.getByRole("tooltip").textContent).toBe(
      "Clear the conversation for everyone",
    );
  });

  it("opens the tooltip for the keyboard too", async () => {
    renderComposer({ hasMessages: true, isOwner: true });

    // The field first, then this button. The send button in between is disabled while
    // the draft is empty, so it is not in the tab order to begin with.
    await userEvent.tab();
    await userEvent.tab();

    expect(screen.getByRole("tooltip").textContent).toBe(
      "Clear the conversation for everyone",
    );
  });

  /**
   * The tooltip is drawn, not announced. The sentence that says who it reaches has to
   * be the button's own name, or a screen reader would be told nothing at all.
   */
  it("gives the button the same sentence it shows on hover", () => {
    renderComposer({ hasMessages: true, isOwner: true });

    const button = screen.getByRole("button", { name: "Clear the conversation for everyone" });
    expect(button.getAttribute("aria-label")).toBe("Clear the conversation for everyone");
  });
});
