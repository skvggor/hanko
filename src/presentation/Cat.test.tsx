import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

    await userEvent.click(screen.getByRole("button", { name: /remove/i }));

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
