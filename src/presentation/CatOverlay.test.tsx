import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatMessage } from "@domain/chat";
import type { PublicParticipant } from "@domain/protocol";
import { createTranslator } from "@application/i18n";
import { CatOverlay } from "@presentation/CatOverlay";

const translate = createTranslator("en-US");

function participant(overrides: Partial<PublicParticipant> = {}): PublicParticipant {
  return {
    id: "p1",
    name: "Ana",
    role: "voter",
    isOwner: true,
    isConnected: true,
    hasVoted: false,
    ...overrides,
  };
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    authorId: "p1",
    authorName: "Ana",
    text: "oi",
    sentAt: 1,
    ...overrides,
  };
}

describe("CatOverlay", () => {
  it("renders one cat per connected participant", () => {
    const { container } = render(
      <CatOverlay
        isOwner={false}
        messages={[]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={vi.fn()}
        participants={[participant(), participant({ id: "p2", name: "Bia" })]}
        translate={translate}
      />,
    );

    expect(container.querySelectorAll(".cat")).toHaveLength(2);
  });

  it("hides disconnected participants", () => {
    const { container } = render(
      <CatOverlay
        isOwner={false}
        messages={[]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={vi.fn()}
        participants={[participant(), participant({ id: "p2", name: "Bia", isConnected: false })]}
        translate={translate}
      />,
    );

    expect(container.querySelectorAll(".cat")).toHaveLength(1);
  });

  it("sends messages through the composer", async () => {
    const onSend = vi.fn();
    render(
      <CatOverlay
        isOwner={false}
        messages={[]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={onSend}
        participants={[participant()]}
        translate={translate}
      />,
    );

    await userEvent.type(screen.getByRole("textbox"), "hello");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("lets the owner clear messages", async () => {
    const onClear = vi.fn();
    render(
      <CatOverlay
        isOwner
        messages={[message()]}
        myParticipantId="p1"
        onClear={onClear}
        onSend={vi.fn()}
        participants={[participant()]}
        translate={translate}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Clear the conversation" }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("announces messages in a live region", () => {
    render(
      <CatOverlay
        isOwner={false}
        messages={[message({ text: "vamos" })]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={vi.fn()}
        participants={[participant()]}
        translate={translate}
      />,
    );

    expect(screen.getByRole("log").textContent).toContain("Ana: vamos");
  });

  it("lets the owner take control of their cat and drive it with the keyboard", async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    vi.stubGlobal("innerHeight", 400);
    vi.stubGlobal("innerWidth", 800);

    const { container } = render(
      <CatOverlay
        isOwner={false}
        messages={[]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={vi.fn()}
        participants={[participant()]}
        translate={translate}
      />,
    );

    const cat = container.querySelector('[data-testid="cat-p1"]');
    await userEvent.click(cat!.querySelector(".cat__button") as HTMLElement);

    expect(cat).toHaveAttribute("data-controlled", "true");

    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    });

    expect(cat).toHaveAttribute("style", expect.stringContaining("translate(0px, 16px)"));
  });

  it("makes the controlled cat jump on the space bar", async () => {
    const { container } = render(
      <CatOverlay
        isOwner={false}
        messages={[]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={vi.fn()}
        participants={[participant()]}
        translate={translate}
      />,
    );

    const cat = container.querySelector('[data-testid="cat-p1"]');
    await userEvent.click(cat!.querySelector(".cat__button") as HTMLElement);

    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });

    expect(cat).toHaveAttribute("data-activity", "jumping");
  });

  it("turns the controlled cat to face the way it is moving", async () => {
    const { container } = render(
      <CatOverlay
        isOwner={false}
        messages={[]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={vi.fn()}
        participants={[participant()]}
        translate={translate}
      />,
    );

    const cat = container.querySelector('[data-testid="cat-p1"]');
    await userEvent.click(cat!.querySelector(".cat__button") as HTMLElement);

    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    });

    expect(container.querySelector(".cat-sprite")).toHaveAttribute("data-direction", "left");
  });

  it("drops the cat selection while typing and takes it back after", async () => {
    const { container } = render(
      <CatOverlay
        isOwner={false}
        messages={[]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={vi.fn()}
        participants={[participant()]}
        translate={translate}
      />,
    );

    const cat = container.querySelector('[data-testid="cat-p1"]');
    await userEvent.click(cat!.querySelector(".cat__button") as HTMLElement);
    expect(cat).toHaveAttribute("data-controlled", "true");

    const input = screen.getByRole("textbox");
    act(() => {
      input.focus();
    });
    expect(cat).toHaveAttribute("data-controlled", "false");

    act(() => {
      input.blur();
    });
    expect(cat).toHaveAttribute("data-controlled", "true");
  });

  it("lets the space bar type instead of jumping while the composer is focused", async () => {
    const onSend = vi.fn();
    render(
      <CatOverlay
        isOwner={false}
        messages={[]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={onSend}
        participants={[participant()]}
        translate={translate}
      />,
    );

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "a b{Enter}");

    expect(onSend).toHaveBeenCalledWith("a b");
  });

  it("does not move a cat that is asleep", async () => {
    const { container } = render(
      <CatOverlay
        isOwner={false}
        messages={[]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={vi.fn()}
        participants={[participant()]}
        translate={translate}
      />,
    );

    const cat = container.querySelector('[data-testid="cat-p1"]');
    await userEvent.click(cat!.querySelector(".cat__button") as HTMLElement);
    await userEvent.click(container.querySelector(".cat-controls__button") as HTMLElement);

    const before = cat!.getAttribute("style");
    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    });

    expect(cat).toHaveAttribute("data-controlled", "false");
    expect(cat!.getAttribute("style")).toBe(before);
  });

  it("releases the controlled cat on Escape", async () => {
    const { container } = render(
      <CatOverlay
        isOwner={false}
        messages={[]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={vi.fn()}
        participants={[participant()]}
        translate={translate}
      />,
    );

    const cat = container.querySelector('[data-testid="cat-p1"]');
    await userEvent.click(cat!.querySelector(".cat__button") as HTMLElement);

    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(cat).toHaveAttribute("data-controlled", "false");
  });

  it("removes a cat from the overlay", async () => {
    const { container } = render(
      <CatOverlay
        isOwner={false}
        messages={[]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={vi.fn()}
        participants={[participant()]}
        translate={translate}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(container.querySelector(".cat")).toBeNull();
  });

  it("controls the server-backed cat in place and publishes its movement", async () => {
    const onUpdateCat = vi.fn();
    const { container } = render(
      <CatOverlay
        cats={[{
          participantId: "p1",
          breed: "tabby",
          x: 0.12,
          y: 0.72,
          direction: "right",
          activity: "idle",
          isPaused: false,
        }]}
        isOwner={false}
        messages={[]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={vi.fn()}
        onUpdateCat={onUpdateCat}
        participants={[participant()]}
        translate={translate}
      />,
    );

    const cat = container.querySelector('[data-testid="cat-p1"]');
    await waitFor(() => expect(cat).toHaveAttribute("data-controlled", "true"));

    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    });

    await waitFor(() => expect(onUpdateCat).toHaveBeenCalled());
    expect(onUpdateCat).toHaveBeenLastCalledWith(expect.objectContaining({ direction: "right" }));
  });

  it("does not select a server-backed cat that is already asleep", async () => {
    const { container } = render(
      <CatOverlay
        cats={[{
          participantId: "p1",
          breed: "tabby",
          x: 0.12,
          y: 0.72,
          direction: "right",
          activity: "sleeping",
          isPaused: true,
        }]}
        isOwner={false}
        messages={[]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={vi.fn()}
        participants={[participant()]}
        translate={translate}
      />,
    );

    await new Promise((resolve) => window.setTimeout(resolve, 10));

    expect(container.querySelector('[data-testid="cat-p1"]')).toHaveAttribute(
      "data-controlled",
      "false",
    );
  });

  it("shows a brief angry reaction when the controlled cat collides", async () => {
    const { container } = render(
      <CatOverlay
        cats={[
          {
            participantId: "p1",
            breed: "tabby",
            x: 0.12,
            y: 0.72,
            direction: "right",
            activity: "idle",
            isPaused: false,
          },
          {
            participantId: "p2",
            breed: "siamese",
            x: 0.13,
            y: 0.72,
            direction: "left",
            activity: "idle",
            isPaused: false,
          },
        ]}
        isOwner={false}
        messages={[]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={vi.fn()}
        participants={[participant(), participant({ id: "p2", name: "Bia" })]}
        translate={translate}
      />,
    );

    const cat = container.querySelector('[data-testid="cat-p1"]');
    await waitFor(() => expect(cat).toHaveAttribute("data-controlled", "true"));

    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    });

    expect(cat).toHaveAttribute("data-activity", "angry");
  });

  it("publishes a pause even before the cat has a measured position", async () => {
    const onUpdateCat = vi.fn();
    const { container } = render(
      <CatOverlay
        isOwner={false}
        messages={[]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={vi.fn()}
        onUpdateCat={onUpdateCat}
        participants={[participant()]}
        translate={translate}
      />,
    );

    await userEvent.click(container.querySelector(".cat-controls__button") as HTMLElement);

    expect(onUpdateCat).toHaveBeenCalledWith(expect.objectContaining({
      x: 0,
      y: 0,
      activity: "sleeping",
      isPaused: true,
    }));
  });
});
