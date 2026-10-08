import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Shell } from "@presentation/Shell";
import { createTranslator } from "@application/i18n";

const translate = createTranslator("en-US");

describe("Shell", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the app name once, in the top level heading", () => {
    render(
      <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()} translate={translate}>
        <p>route content</p>
      </Shell>,
    );

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("Hanko");
  });

  it("shows the slogan", () => {
    render(
      <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()} translate={translate}>
        <p>x</p>
      </Shell>,
    );

    expect(screen.getByText("Your team's consensus.")).toBeTruthy();
  });

  it("renders the wordmark art", () => {
    const { container } = render(
      <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()} translate={translate}>
        <p>x</p>
      </Shell>,
    );

    expect(container.querySelector("header svg")).not.toBeNull();
  });

  it("renders whatever the route wants", () => {
    render(
      <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()} translate={translate}>
        <p>route content</p>
      </Shell>,
    );

    expect(screen.getByText("route content")).toBeTruthy();
  });

  it("keeps the signature in the chrome", () => {
    render(
      <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()} translate={translate}>
        <p>x</p>
      </Shell>,
    );

    expect(screen.getByRole("link", { name: "skvggor" })).toBeTruthy();
  });

  it("shows no error banner when there is nothing wrong", () => {
    render(
      <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()} translate={translate}>
        <p>x</p>
      </Shell>,
    );

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a translated error", () => {
    render(
      <Shell errorCode="not_owner" locale="en-US" onLocaleChange={vi.fn()} translate={translate}>
        <p>x</p>
      </Shell>,
    );

    expect(screen.getByRole("alert").textContent).toBe(
      "Only the room owner can do this",
    );
  });

  it("marks the active language as pressed", () => {
    render(
      <Shell errorCode={null} locale="pt-BR" onLocaleChange={vi.fn()} translate={translate}>
        <p>x</p>
      </Shell>,
    );

    expect(screen.getByRole("button", { name: "PT" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("reports the chosen language", () => {
    const onLocaleChange = vi.fn();
    render(
      <Shell errorCode={null} locale="en-US" onLocaleChange={onLocaleChange} translate={translate}>
        <p>x</p>
      </Shell>,
    );

    screen.getByRole("button", { name: "PT" }).click();

    expect(onLocaleChange).toHaveBeenCalledWith("pt-BR");
  });

  it("renders no canvas backdrop", () => {
    const { container } = render(
      <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()} translate={translate}>
        <p>x</p>
      </Shell>,
    );

    expect(container.querySelector("canvas")).toBeNull();
  });
  describe("session name", () => {
    it("shows nothing when the room has no name", () => {
      render(
        <Shell
          errorCode={null}
          locale="en-US"
          onLocaleChange={vi.fn()}
          sessionName={null}
          translate={translate}
        >
          <p>x</p>
        </Shell>,
      );

      expect(document.querySelector(".session-name")).toBeNull();
    });

    it("shows the name under the wordmark", () => {
      render(
        <Shell
          errorCode={null}
          locale="en-US"
          onLocaleChange={vi.fn()}
          sessionName="Sprint 42"
          translate={translate}
        >
          <p>x</p>
        </Shell>,
      );

      expect(screen.getByText("Sprint 42")).toBeTruthy();
    });

    it("keeps the title out of the centered wordmark row", () => {
      render(
        <Shell
          errorCode={null}
          locale="en-US"
          onLocaleChange={vi.fn()}
          sessionName="Sprint 42"
          translate={translate}
        >
          <p>x</p>
        </Shell>,
      );

      const header = document.querySelector("header");
      expect(header?.contains(screen.getByText("Sprint 42"))).toBe(false);
    });

    it("reserves room below the content when a floating dock is present", () => {
      const { container } = render(
        <Shell
          errorCode={null}
          hasFloatingDock
          locale="en-US"
          onLocaleChange={vi.fn()}
          translate={translate}
        >
          <p>x</p>
        </Shell>,
      );

      expect(container.firstElementChild?.className).toContain("pb-24");
    });

    it("adds no reserved room without a dock", () => {
      const { container } = render(
        <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()} translate={translate}>
          <p>x</p>
        </Shell>,
      );

      expect(container.firstElementChild?.className).not.toContain("pb-24");
    });

    it("treats an empty name as no name", () => {
      render(
        <Shell
          errorCode={null}
          locale="en-US"
          onLocaleChange={vi.fn()}
          sessionName=""
          translate={translate}
        >
          <p>x</p>
        </Shell>,
      );

      expect(document.querySelector(".session-name")).toBeNull();
    });
  });
});

describe("Shell reduced motion", () => {
  /**
   * The listener has to be reachable from the test so the change event can be
   * delivered the way the browser would, rather than by re-rendering with a
   * different stub, which would never exercise the subscription at all.
   */
  function stubMatchMedia(matches: boolean) {
    const listeners = new Set<() => void>();
    const query = {
      matches,
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        listeners.add(listener);
      }),
      removeEventListener: vi.fn((_type: string, listener: () => void) => {
        listeners.delete(listener);
      }),
    };

    vi.stubGlobal("matchMedia", vi.fn(() => query));

    return {
      query,
      emitChange(next: boolean) {
        query.matches = next;
        for (const listener of listeners) listener();
      },
      get listenerCount() {
        return listeners.size;
      },
    };
  }

  function renderShell() {
    const { container } = render(
      <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()} translate={translate}>
        <p>x</p>
      </Shell>,
    );
    return container.firstElementChild;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leaves motion on when the reader has not asked for less", () => {
    stubMatchMedia(false);

    expect(renderShell()?.getAttribute("data-reduced-motion")).toBe("false");
  });

  it("reflects a reader who has asked for less motion", () => {
    stubMatchMedia(true);

    expect(renderShell()?.getAttribute("data-reduced-motion")).toBe("true");
  });

  it("asks the reader's own preference, not a guessed one", () => {
    const media = stubMatchMedia(false);

    renderShell();

    expect(media.query).toBeDefined();
    expect(vi.mocked(globalThis.matchMedia)).toHaveBeenCalledWith(
      "(prefers-reduced-motion: reduce)",
    );
  });

  it("follows the preference when the reader changes it mid session", () => {
    const media = stubMatchMedia(false);
    const shell = renderShell();

    act(() => media.emitChange(true));

    expect(shell?.getAttribute("data-reduced-motion")).toBe("true");
  });

  it("gives motion back when the reader turns it on again", () => {
    const media = stubMatchMedia(true);
    const shell = renderShell();

    act(() => media.emitChange(false));

    expect(shell?.getAttribute("data-reduced-motion")).toBe("false");
  });

  it("subscribes once so a change is not applied twice", () => {
    const media = stubMatchMedia(false);

    renderShell();

    expect(media.listenerCount).toBe(1);
  });

  it("drops the subscription when it goes away, so no listener outlives the shell", () => {
    const media = stubMatchMedia(false);
    const { unmount } = render(
      <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()} translate={translate}>
        <p>x</p>
      </Shell>,
    );

    unmount();

    expect(media.listenerCount).toBe(0);
    expect(media.query.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("assumes motion is fine when the browser cannot answer", () => {
    vi.stubGlobal("matchMedia", undefined);

    expect(renderShell()?.getAttribute("data-reduced-motion")).toBe("false");
  });

  it("assumes motion is fine when the browser has no matchMedia at all", () => {
    vi.stubGlobal("matchMedia", {});

    expect(renderShell()?.getAttribute("data-reduced-motion")).toBe("false");
  });
});

describe("Shell centring", () => {
  function renderShell(props: Partial<Parameters<typeof Shell>[0]> = {}) {
    return render(
      <Shell
        errorCode={null}
        locale="en-US"
        onLocaleChange={vi.fn()}
        translate={translate}
        {...props}
      >
        <p>x</p>
      </Shell>,
    );
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });

  it("holds the header at the top of the column", () => {
    const { container } = renderShell();
    const root = container.firstElementChild;

    expect(root?.firstElementChild?.tagName).toBe("HEADER");
  });

  it("holds the footer at the bottom of the column", () => {
    const { container } = renderShell();
    const root = container.firstElementChild;

    expect(root?.lastElementChild?.tagName).toBe("FOOTER");
  });

  it("keeps the chrome out of the centred frame", () => {
    const { container } = renderShell();
    const frame = container.querySelector("[data-frame]");

    expect(frame?.querySelector("header")).toBeNull();
    expect(frame?.querySelector("footer")).toBeNull();
  });

  it("gives the content the space between the header and the footer", () => {
    const { container } = renderShell();

    expect(container.querySelector("main")?.className).toContain("flex-1");
  });

  it("centres the content in that space instead of leaving it at the top", () => {
    const { container } = renderShell();

    expect(container.querySelector("main")?.className).toContain("justify-center");
  });

  it("gives the app a frame to centre inside", () => {
    const { container } = renderShell();

    expect(container.querySelector("[data-frame]")).toBeTruthy();
  });

  it("centres the frame horizontally", () => {
    const { container } = renderShell();

    expect(container.querySelector("[data-frame]")?.className).toContain("mx-auto");
  });

  it("caps the frame width so the app never stretches across a 4k display", () => {
    const { container } = renderShell();

    expect(container.querySelector("[data-frame]")?.className).toContain("max-w-");
  });

  it("keeps the content able to grow past the frame rather than clipping it", () => {
    const { container } = renderShell();

    expect(container.firstElementChild?.className).toContain("min-h-screen");
  });

  it("centres the room as well as the landing page", () => {
    const { container } = renderShell({ hasFloatingDock: true });

    expect(container.querySelector("main")?.className).toContain("justify-center");
  });

  it("still reserves room for the floating dock", () => {
    const { container } = renderShell({ hasFloatingDock: true });

    expect(container.firstElementChild?.className).toContain("pb-24");
  });

  it("leaves the language switcher in the header where it can be reached from anywhere", () => {
    const { container } = renderShell();

    expect(container.querySelector("header nav")).toBeTruthy();
  });
});
