import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatMessage } from "@domain/chat";
import type { PublicParticipant } from "@domain/protocol";
import { createTranslator } from "@application/i18n";
import { CatOverlay, MAX_VISIBLE_LANE_TOP_REM } from "@presentation/CatOverlay";

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

  it("keeps every cat within the visible lanes in a crowded room", () => {
    const crowded = Array.from({ length: 30 }, (_, index) =>
      participant({ id: `p${index}`, name: `Pessoa${index}` }),
    );

    const { container } = render(
      <CatOverlay
        isOwner={false}
        messages={[]}
        myParticipantId="p0"
        onClear={vi.fn()}
        onSend={vi.fn()}
        participants={crowded}
        translate={translate}
      />,
    );

    // The lane offset is what puts a cat on screen, so an unbounded one walks the
    // overflow off the bottom where it can never be clicked.
    const offsets = [...container.querySelectorAll(".cat")].map((cat) =>
      Number.parseFloat((cat.getAttribute("style") ?? "").replace(/^top: ([0-9.]+)rem.*$/, "$1")),
    );

    expect(offsets).toHaveLength(30);
    for (const offset of offsets) {
      expect(Number.isNaN(offset)).toBe(false);
      expect(offset).toBeLessThanOrEqual(MAX_VISIBLE_LANE_TOP_REM);
    }
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
      (cat!.querySelector(".cat__button") as HTMLElement).dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
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
      (cat!.querySelector(".cat__button") as HTMLElement).dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true }),
      );
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
      (cat!.querySelector(".cat__button") as HTMLElement).dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      );
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
      (cat!.querySelector(".cat__button") as HTMLElement).dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
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
      (cat!.querySelector(".cat__button") as HTMLElement).dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
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
      (cat!.querySelector(".cat__button") as HTMLElement).dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      );
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

describe("CatOverlay keyboard ownership", () => {
  function renderControlled() {
    const view = render(
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

    const cat = view.container.querySelector('[data-testid="cat-p1"]');
    const button = cat?.querySelector(".cat__button") as HTMLElement;

    return { ...view, button, cat };
  }

  async function takeControl() {
    const view = renderControlled();
    await userEvent.click(view.button);
    expect(view.cat).toHaveAttribute("data-controlled", "true");
    return view;
  }

  it("leaves the page scrollable while the cat is controlled", async () => {
    const { button } = await takeControl();
    button.blur();

    const event = new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true });
    act(() => {
      globalThis.dispatchEvent(event);
    });

    // The arrow keys are how a keyboard scrolls the room. Taking them for a cat
    // would trap anyone who cannot reach the mouse to release it.
    expect(event.defaultPrevented).toBe(false);
  });

  it("still moves the cat while it holds the focus", async () => {
    const { button, cat } = await takeControl();

    act(() => {
      button.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });

    expect(cat).toHaveAttribute("style", expect.stringContaining("translate(0px, 16px)"));
  });

  it("lets the chat composer keep its own space bar", async () => {
    const view = render(
      <CatOverlay
        isOwner={false}
        messages={[message()]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={vi.fn()}
        participants={[participant()]}
        translate={translate}
      />,
    );

    const cat = view.container.querySelector('[data-testid="cat-p1"]');
    await userEvent.click(cat?.querySelector(".cat__button") as HTMLElement);

    const input = view.container.querySelector(".cat-composer__input") as HTMLElement;
    input.focus();
    const event = new KeyboardEvent("keydown", { key: " ", cancelable: true, bubbles: true });

    act(() => {
      input.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
  });

  it("does not claim the space bar of an unrelated button", async () => {
    await takeControl();
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    const event = new KeyboardEvent("keydown", { key: " ", cancelable: true, bubbles: true });

    act(() => {
      elsewhere.dispatchEvent(event);
    });
    elsewhere.remove();

    expect(event.defaultPrevented).toBe(false);
  });

  it("releases the cat on escape even without the focus", async () => {
    const { button, cat } = await takeControl();
    button.blur();

    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(cat).toHaveAttribute("data-controlled", "false");
  });

  it("stops claiming keys for a text field that is not an input element", async () => {
    await takeControl();
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    document.body.append(editor);
    const event = new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true, bubbles: true });

    act(() => {
      editor.dispatchEvent(event);
    });
    editor.remove();

    expect(event.defaultPrevented).toBe(false);
  });
});

describe("CatOverlay reconciliation", () => {
  const others = [participant(), participant({ id: "p2", name: "Bia" })];

  function renderOverlay(
    participants: PublicParticipant[],
    myParticipantId: string | null = "p1",
  ) {
    return render(
      <CatOverlay
        isOwner={false}
        messages={[]}
        myParticipantId={myParticipantId}
        onClear={vi.fn()}
        onSend={vi.fn()}
        participants={participants}
        translate={translate}
      />,
    );
  }

  it("brings back a cat the moment its owner is in the room again", async () => {
    const view = renderOverlay(others);

    await userEvent.click(
      view.container.querySelector(
        '[data-testid="cat-p1"] .cat-controls__button:last-of-type',
      ) as HTMLElement,
    );
    expect(view.container.querySelectorAll(".cat")).toHaveLength(1);

    // Hiding is a local, temporary act. Keeping the id forever meant a refresh from
    // the other side left their cat gone for the rest of the session, with no way
    // back to it.
    view.rerender(
      <CatOverlay
        isOwner={false}
        messages={[]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={vi.fn()}
        participants={[
          participant({ isConnected: false }),
          participant({ id: "p2", name: "Bia" }),
        ]}
        translate={translate}
      />,
    );
    expect(view.container.querySelectorAll(".cat")).toHaveLength(1);

    view.rerender(
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

    expect(view.container.querySelectorAll(".cat")).toHaveLength(2);
  });

  it("still renders a cat whose state has not arrived yet", () => {
    const view = render(
      <CatOverlay
        cats={[]}
        isOwner={false}
        messages={[]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={vi.fn()}
        participants={others}
        translate={translate}
      />,
    );

    // A participant can be connected before the room has published a cat for them.
    // Standing them in a lane is better than making them vanish, and better than
    // asserting a state into existence and hoping every read downstream is guarded.
    const cats = view.container.querySelectorAll(".cat");
    expect(cats).toHaveLength(2);
    expect(cats[0]?.getAttribute("data-synced")).toBe("false");
  });

  it("announces only the message that just arrived", () => {
    const view = render(
      <CatOverlay
        isOwner={false}
        messages={[message({ id: "m1", authorName: "Ana", text: "primeira" })]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={vi.fn()}
        participants={[participant()]}
        translate={translate}
      />,
    );
    expect(screen.getByRole("log").textContent).toContain("primeira");

    view.rerender(
      <CatOverlay
        isOwner={false}
        messages={[
          message({ id: "m1", authorName: "Ana", text: "primeira" }),
          message({ id: "m2", authorName: "Bia", text: "segunda" }),
        ]}
        myParticipantId="p1"
        onClear={vi.fn()}
        onSend={vi.fn()}
        participants={[participant()]}
        translate={translate}
      />,
    );

    // A live region holding the whole backlog is read out again from the start on
    // every change, so a busy room talks over itself.
    const log = screen.getByRole("log").textContent ?? "";
    expect(log).toContain("segunda");
    expect(log).not.toContain("primeira");
  });
});
