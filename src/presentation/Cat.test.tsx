import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatMessage } from "@domain/chat";
import { createTranslator } from "@application/i18n";
import { Cat } from "@presentation/Cat";

const translate = createTranslator("en-US");

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    authorId: "p1",
    authorName: "Ana",
    text: "vamos nessa",
    sentAt: 1,
    ...overrides,
  };
}

function renderCat(
  props: Partial<React.ComponentProps<typeof Cat>> = {},
) {
  const onRequestControl = vi.fn();
  const onReleaseControl = vi.fn();
  const onRemove = vi.fn();

  const result = render(
    <Cat
      controlledPosition={null}
      isControllable={false}
      isControlled={false}
      laneIndex={0}
      messages={[]}
      name="Ana"
      onReleaseControl={onReleaseControl}
      onRemove={onRemove}
      onRequestControl={onRequestControl}
      participantId="p1"
      translate={translate}
      {...props}
    />,
  );

  return { onRequestControl, onReleaseControl, onRemove, ...result };
}

describe("Cat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a sprite for the participant", () => {
    const { container } = renderCat();

    expect(container.querySelector(".cat-sprite")).toBeTruthy();
  });

  it("shows a speech bubble for the participant's latest message", () => {
    const { container } = renderCat({
      messages: [message(), message({ id: "m2", text: "novo" })],
    });

    expect(container.querySelector(".speech-bubble__text")?.textContent).toBe("novo");
  });

  it("does not show other participants' messages as its own bubble", () => {
    const { container } = renderCat({
      messages: [message({ authorId: "p2", text: "oi" })],
    });

    expect(container.querySelector(".speech-bubble")).toBeNull();
  });

  it("requests control when the controllable cat is clicked", async () => {
    const { onRequestControl, container } = renderCat({ isControllable: true });

    await userEvent.click(container.querySelector(".cat__button") as HTMLElement);

    expect(onRequestControl).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".cat-controls")).not.toBeNull();
  });

  it("does nothing when a controlled cat is clicked", async () => {
    const { onRequestControl, onReleaseControl, container } = renderCat({
      isControllable: true,
      isControlled: true,
      controlledPosition: { x: 10, y: 20 },
    });

    await userEvent.click(container.querySelector(".cat__button") as HTMLElement);

    expect(onReleaseControl).not.toHaveBeenCalled();
    expect(onRequestControl).not.toHaveBeenCalled();
  });

  it("keeps the controlled cat's position in left and top instead of rebasing from the origin", () => {
    const { container } = renderCat({
      isControllable: true,
      isControlled: true,
      controlledPosition: { x: 312, y: 456 },
    });

    const cat = container.querySelector<HTMLElement>(".cat");
    expect(cat?.style.left).toBe("312px");
    expect(cat?.style.top).toBe("456px");
    expect(cat?.style.transform).toBe("");
  });

  it("shows the controls only on the owner's cat", () => {
    const { container: own } = renderCat({ isControllable: true });
    const { container: other } = renderCat({
      isControllable: false,
      participantId: "p2",
      name: "Bia",
    });

    expect(own.querySelector(".cat-controls")).not.toBeNull();
    expect(other.querySelector(".cat-controls")).toBeNull();
  });

  it("removes the cat and releases control", async () => {
    const { onRemove, onReleaseControl } = renderCat({
      isControllable: true,
      isControlled: true,
      controlledPosition: { x: 0, y: 0 },
    });

    await userEvent.click(screen.getByRole("button", { name: /send this cat away/i }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onReleaseControl).toHaveBeenCalledTimes(1);
  });

  it("pauses the cat and releases control", async () => {
    const { onReleaseControl, container } = renderCat({
      isControllable: true,
      isControlled: true,
      controlledPosition: { x: 0, y: 0 },
    });

    await userEvent.click(container.querySelector(".cat__button") as HTMLElement);
    await userEvent.click(screen.getByRole("button", { name: /pause/i }));

    expect(onReleaseControl).toHaveBeenCalled();
  });

  it("puts the cat to sleep when it is paused", async () => {
    const { container } = renderCat({ isControllable: true });

    await userEvent.click(container.querySelector(".cat-controls__button") as HTMLElement);

    const cat = container.querySelector(".cat");
    expect(cat).toHaveAttribute("data-activity", "sleeping");
    expect(container.querySelector(".cat__sleep-z")).not.toBeNull();
  });

  it("tells the room when the cat is put to sleep", async () => {
    const onPauseChange = vi.fn();
    const { container } = renderCat({ isControllable: true, onPauseChange });

    await userEvent.click(container.querySelector(".cat-controls__button") as HTMLElement);

    expect(onPauseChange).toHaveBeenCalledWith(true);
  });
});

/**
 * The ring and the name are the one marker in the cat that says "your arrow keys go to
 * this cat right now". The arrow keys answer to the focus and to nothing else, so a cat
 * that is held but not focused is not being driven and should stop claiming to be.
 */
describe("Cat and the marker for the cat being driven", () => {
  const heldAndFocused = {
    isControllable: true,
    isControlled: true,
    controlledPosition: { x: 0, y: 0 },
  };

  it("names the cat while it is being driven", async () => {
    const { container } = renderCat(heldAndFocused);
    await userEvent.click(container.querySelector(".cat__button") as HTMLElement);

    expect(container.querySelector(".cat__badge--controlled")?.textContent).toBe("Ana");
  });

  it("calls the cat driven when it is held and focused", async () => {
    const { container } = renderCat(heldAndFocused);
    await userEvent.click(container.querySelector(".cat__button") as HTMLElement);

    expect(container.querySelector(".cat")?.getAttribute("data-driving")).toBe("true");
  });

  it("drops the marker when the focus moves away", async () => {
    const { container } = renderCat(heldAndFocused);
    const button = container.querySelector(".cat__button") as HTMLElement;
    await userEvent.click(button);

    act(() => {
      fireEvent.blur(button);
    });

    expect(container.querySelector(".cat__badge--controlled")).toBeNull();
    expect(container.querySelector(".cat")?.getAttribute("data-driving")).toBe("false");
  });

  /**
   * Held and not focused is still held, and the room still knows it: this cat is above
   * the others, its patrol is stopped and its controls are showing. Collapsing the two
   * states would have taken all of that with them.
   */
  it("keeps holding the cat after the focus moves away", async () => {
    const { container } = renderCat(heldAndFocused);
    const button = container.querySelector(".cat__button") as HTMLElement;
    await userEvent.click(button);

    act(() => {
      fireEvent.blur(button);
    });

    expect(container.querySelector(".cat")?.getAttribute("data-controlled")).toBe("true");
  });

  it("marks nothing on a cat nobody is holding", () => {
    const { container } = renderCat({ isControllable: true, isControlled: false });

    expect(container.querySelector(".cat__badge--controlled")).toBeNull();
    expect(container.querySelector(".cat")?.getAttribute("data-driving")).toBe("false");
  });

  it("still tells a screen reader who holds the cat when the focus is gone", async () => {
    const { container } = renderCat(heldAndFocused);
    const button = container.querySelector(".cat__button") as HTMLElement;
    await userEvent.click(button);

    act(() => {
      fireEvent.blur(button);
    });

    expect(container.querySelector(".visually-hidden")?.textContent).toContain("controlled");
  });
});
