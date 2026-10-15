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

    expect(screen.queryByRole("button", { name: "Clear the conversation" })).toBeNull();
  });

  it("hides the clear button when there is nothing to clear", () => {
    renderComposer({ hasMessages: false, isOwner: true });

    expect(screen.queryByRole("button", { name: "Clear the conversation" })).toBeNull();
  });

  it("lets the owner clear the conversation", async () => {
    const { onClear } = renderComposer({ hasMessages: true, isOwner: true });

    await userEvent.click(screen.getByRole("button", { name: "Clear the conversation" }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
