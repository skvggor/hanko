import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Root } from "@presentation/Root";
import type { Translator } from "@application/i18n";

const harness = vi.hoisted(() => ({
  fetchCalls: [] as unknown[],
  pushState: [] as string[],
}));

vi.mock("@application/createRoom", () => ({
  CreateRoomError: class CreateRoomError extends Error {
    constructor(readonly reason: string) {
      super(reason);
      this.name = "CreateRoomError";
    }
  },
  createRoom: async () => {
    harness.fetchCalls.push("called");
    if (harness.fetchCalls.at(-1) === "fail") throw new Error("network");
    return "newroom1";
  },
}));

vi.mock("@presentation/RoomScreen", () => ({
  RoomScreen: ({ roomId, translate }: { roomId: string; translate: Translator }) => (
    <>
      <p data-testid="room-screen">room:{roomId}</p>
      <p data-testid="room-copy">{translate("room.waiting")}</p>
    </>
  ),
}));

function setPath(path: string) {
  vi.stubGlobal("location", {
    pathname: path,
    origin: "https://hanko.pages.dev",
    protocol: "https:",
  });
}

describe("Root", () => {
  beforeEach(() => {
    harness.fetchCalls.length = 0;
    harness.pushState.length = 0;

    vi.stubGlobal("navigator", { language: "en-US" });
    setPath("/");

    const history = {
      pushState(_state: unknown, _title: string, path: string) {
        harness.pushState.push(path);
        setPath(path);
      },
    };
    vi.stubGlobal("history", history);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the landing page at the root", () => {
    render(<Root />);
    expect(screen.getByRole("button", { name: "Start a room" })).toBeTruthy();
  });

  it("explains how the room works", () => {
    render(<Root />);
    expect(
      screen.getByText("Start a room and share the link."),
    ).toBeTruthy();
    expect(
      screen.getByText("Everyone picks a number in private."),
    ).toBeTruthy();
  });

  it("does not create a room before the user asks", () => {
    render(<Root />);
    expect(harness.fetchCalls).toHaveLength(0);
  });

  it("creates a room and navigates to it", async () => {
    render(<Root />);

    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));

    expect(harness.fetchCalls).toEqual(["called"]);
    expect(harness.pushState).toEqual(["/room/newroom1"]);
  });

  it("renders the room screen after navigating", async () => {
    render(<Root />);

    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));

    expect(await screen.findByTestId("room-screen")).toBeTruthy();
    expect(screen.getByTestId("room-screen").textContent).toBe("room:newroom1");
  });

  it("opens a room directly from the url", () => {
    setPath("/room/abc12345");
    render(<Root />);
    expect(screen.getByTestId("room-screen").textContent).toBe("room:abc12345");
  });

  it("falls back to the landing page for an unknown path", () => {
    setPath("/nonsense");
    render(<Root />);
    expect(screen.getByRole("button", { name: "Start a room" })).toBeTruthy();
  });

  it("falls back to the landing page for an invalid room id", () => {
    setPath("/room/TOO-LONG-AND-UPPERCASE");
    render(<Root />);
    expect(screen.getByRole("button", { name: "Start a room" })).toBeTruthy();
  });

  it("switches to portuguese", async () => {
    render(<Root />);

    await userEvent.click(screen.getByRole("button", { name: "PT" }));

    expect(screen.getByRole("button", { name: "Criar sala" })).toBeTruthy();
  });

  it("switches back to english", async () => {
    render(<Root />);

    await userEvent.click(screen.getByRole("button", { name: "PT" }));
    await userEvent.click(screen.getByRole("button", { name: "EN" }));

    expect(screen.getByRole("button", { name: "Start a room" })).toBeTruthy();
  });

  it("starts from the browser locale", () => {
    vi.stubGlobal("navigator", { language: "pt-BR" });
    render(<Root />);
    expect(screen.getByRole("button", { name: "Criar sala" })).toBeTruthy();
  });

  it("falls back to english for an unknown locale", () => {
    vi.stubGlobal("navigator", { language: "ja-JP" });
    render(<Root />);
    expect(screen.getByRole("button", { name: "Start a room" })).toBeTruthy();
  });

  it("keeps the locale when entering a room", async () => {
    render(<Root />);

    await userEvent.click(screen.getByRole("button", { name: "PT" }));
    await userEvent.click(screen.getByRole("button", { name: "Criar sala" }));

    expect(await screen.findByTestId("room-screen")).toBeTruthy();
    expect(screen.getByTestId("room-copy").textContent).toBe(
      "Aguardando pessoas entrarem",
    );
  });

  it("reacts to the browser back button", async () => {
    render(<Root />);
    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));
    await screen.findByTestId("room-screen");

    setPath("/");
    globalThis.dispatchEvent(new Event("popstate"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start a room" })).toBeTruthy();
    });
  });
});
describe("Root language memory", () => {
  beforeEach(() => {
    harness.fetchCalls.length = 0;
    harness.pushState.length = 0;
    setPath("/");

    vi.stubGlobal("history", {
      pushState(_state: unknown, _title: string, path: string) {
        harness.pushState.push(path);
        setPath(path);
      },
    });
  });

  it("restores the language the user chose before", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "pt-BR"),
      setItem,
    });
    vi.stubGlobal("navigator", { language: "en-US" });

    render(<Root />);

    expect(screen.getByRole("button", { name: "Criar sala" })).toBeTruthy();
  });

  it("remembers the choice for the next visit", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem });
    vi.stubGlobal("navigator", { language: "en-US" });

    render(<Root />);
    await userEvent.click(screen.getByRole("button", { name: "PT" }));

    expect(setItem).toHaveBeenCalledWith("hanko:locale", "pt-BR");
  });

  it("lets a stored choice beat the browser language", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => (key === "hanko:locale" ? "pt-BR" : null)),
      setItem,
    });
    vi.stubGlobal("navigator", { language: "en-US" });

    render(<Root />);
    await userEvent.click(screen.getByRole("button", { name: "EN" }));

    expect(setItem).toHaveBeenCalledWith("hanko:locale", "en-US");
  });

  it("ignores a stored language the app does not ship", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "ja-JP"),
      setItem: vi.fn(),
    });
    vi.stubGlobal("navigator", { language: "en-US" });

    render(<Root />);

    expect(screen.getByRole("button", { name: "Start a room" })).toBeTruthy();
  });
});
