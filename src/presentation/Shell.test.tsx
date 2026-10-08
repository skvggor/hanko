import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
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
      <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()}
        onLeaveRoom={null}
        onNavigateHome={vi.fn()} translate={translate}>
        <p>route content</p>
      </Shell>,
    );

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("Hanko");
  });

  it("shows the slogan", () => {
    render(
      <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()}
        onLeaveRoom={null}
        onNavigateHome={vi.fn()} translate={translate}>
        <p>x</p>
      </Shell>,
    );

    expect(screen.getByText("Your team's consensus.")).toBeTruthy();
  });

  it("renders the wordmark art", () => {
    const { container } = render(
      <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()}
        onLeaveRoom={null}
        onNavigateHome={vi.fn()} translate={translate}>
        <p>x</p>
      </Shell>,
    );

    expect(container.querySelector("header svg")).not.toBeNull();
  });

  it("renders whatever the route wants", () => {
    render(
      <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()}
        onLeaveRoom={null}
        onNavigateHome={vi.fn()} translate={translate}>
        <p>route content</p>
      </Shell>,
    );

    expect(screen.getByText("route content")).toBeTruthy();
  });

  it("keeps the signature in the chrome", () => {
    render(
      <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()}
        onLeaveRoom={null}
        onNavigateHome={vi.fn()} translate={translate}>
        <p>x</p>
      </Shell>,
    );

    expect(screen.getByRole("link", { name: "skvggor" })).toBeTruthy();
  });

  it("shows no error banner when there is nothing wrong", () => {
    render(
      <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()}
        onLeaveRoom={null}
        onNavigateHome={vi.fn()} translate={translate}>
        <p>x</p>
      </Shell>,
    );

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a translated error", () => {
    render(
      <Shell errorCode="not_owner" locale="en-US" onLocaleChange={vi.fn()} onLeaveRoom={null}
 onNavigateHome={vi.fn()}
 translate={translate}>
        <p>x</p>
      </Shell>,
    );

    expect(screen.getByRole("alert").textContent).toBe(
      "Only the room owner can do this",
    );
  });

  it("marks the active language as pressed", () => {
    render(
      <Shell errorCode={null} locale="pt-BR" onLocaleChange={vi.fn()} onLeaveRoom={null}
 onNavigateHome={vi.fn()}
 translate={translate}>
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
      <Shell errorCode={null} locale="en-US" onLocaleChange={onLocaleChange} onLeaveRoom={null}
 onNavigateHome={vi.fn()}
 translate={translate}>
        <p>x</p>
      </Shell>,
    );

    screen.getByRole("button", { name: "PT" }).click();

    expect(onLocaleChange).toHaveBeenCalledWith("pt-BR");
  });

  it("renders no canvas backdrop", () => {
    const { container } = render(
      <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()}
        onLeaveRoom={null}
        onNavigateHome={vi.fn()} translate={translate}>
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
        onLeaveRoom={null}
        onNavigateHome={vi.fn()}
          sessionName={null}
          translate={translate}
        >
          <p>x</p>
        </Shell>,
      );

      expect(document.querySelector(".session-name")?.textContent).toBe("");
    });

    it("shows the name in the header", () => {
      render(
        <Shell
          errorCode={null}
          locale="en-US"
          onLocaleChange={vi.fn()}
        onLeaveRoom={null}
        onNavigateHome={vi.fn()}
          sessionName="Sprint 42"
          translate={translate}
        >
          <p>x</p>
        </Shell>,
      );

      expect(screen.getByText("Sprint 42")).toBeTruthy();
    });

    it("carries the title in the header rather than beside the wordmark", () => {
      render(
        <Shell
          errorCode={null}
          locale="en-US"
          onLocaleChange={vi.fn()}
        onLeaveRoom={null}
        onNavigateHome={vi.fn()}
          sessionName="Sprint 42"
          translate={translate}
        >
          <p>x</p>
        </Shell>,
      );

      const header = document.querySelector("header");
      expect(header?.contains(screen.getByText("Sprint 42"))).toBe(true);
    });

    it("reserves room below the content when a floating dock is present", () => {
      const { container } = render(
        <Shell
          errorCode={null}
          hasFloatingDock
          locale="en-US"
          onLocaleChange={vi.fn()}
          onLeaveRoom={null}

          onNavigateHome={vi.fn()}

          translate={translate}
        >
          <p>x</p>
        </Shell>,
      );

      expect(container.querySelector("main")?.className).toContain("pb-dock");
    });

    it("adds no reserved room without a dock", () => {
      const { container } = render(
        <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()}
        onLeaveRoom={null}
        onNavigateHome={vi.fn()} translate={translate}>
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
        onLeaveRoom={null}
        onNavigateHome={vi.fn()}
          sessionName=""
          translate={translate}
        >
          <p>x</p>
        </Shell>,
      );

      expect(document.querySelector(".session-name")?.textContent).toBe("");
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
      <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()}
        onLeaveRoom={null}
        onNavigateHome={vi.fn()} translate={translate}>
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
      <Shell errorCode={null} locale="en-US" onLocaleChange={vi.fn()}
        onLeaveRoom={null}
        onNavigateHome={vi.fn()} translate={translate}>
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
        onLeaveRoom={null}
        onNavigateHome={vi.fn()}
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

    expect(container.querySelector("main")?.className).toContain("pb-dock");
  });

  it("leaves the language switcher in the header where it can be reached from anywhere", () => {
    const { container } = renderShell();

    expect(container.querySelector("header nav")).toBeTruthy();
  });
});

describe("Shell chrome", () => {
  function renderShell(props: Partial<Parameters<typeof Shell>[0]> = {}) {
    return render(
      <Shell
        errorCode={null}
        locale="en-US"
        onLocaleChange={vi.fn()}
        onLeaveRoom={null}
        onNavigateHome={vi.fn()}
        translate={translate}
        {...props}
      >
        <p>x</p>
      </Shell>,
    );
  }

  function stubViewport(scrollY: number, { scrollHeight, innerHeight }: {
    scrollHeight: number;
    innerHeight: number;
  }) {
    vi.stubGlobal("scrollY", scrollY);
    vi.stubGlobal("innerHeight", innerHeight);
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: scrollHeight,
    });
  }

  function header(container: Element): Element {
    const element = container.querySelector("header");
    if (!element) throw new Error("no header");
    return element;
  }

  function footer(container: Element): Element {
    const element = container.querySelector("footer");
    if (!element) throw new Error("no footer");
    return element;
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    stubViewport(0, { scrollHeight: 1000, innerHeight: 800 });
  });

  it("puts the logo in the first track, so it stays left when a title takes the middle", () => {
    const { container } = renderShell();

    // A single auto column would let the title shove the logo along; equal outer
    // tracks are what hold the chrome symmetric.
    expect(header(container).className).toContain("grid-cols-[1fr_minmax(0,auto)_1fr]");
  });

  it("reads the logo before the language switcher, so the left one is the logo", () => {
    const { container } = renderShell();
    const element = header(container);

    expect(element.firstElementChild?.querySelector("svg")).toBeTruthy();
    expect(element.querySelector("nav")).toBeTruthy();
  });

  it("lays the language switcher out as a sibling instead of floating it", () => {
    const { container } = renderShell();
    const element = header(container);
    const nav = element.querySelector("nav");

    expect(nav?.parentElement).toBe(element);
    expect(nav?.className).not.toContain("absolute");
  });

  it("gives the header and the footer the same height", () => {
    const { container } = renderShell();

    expect(header(container).className).toContain("h-[var(--chrome-height)]");
    expect(footer(container).className).toContain("h-[var(--chrome-height)]");
  });

  it("pins the header so the wordmark stays reachable", () => {
    const { container } = renderShell();
    const className = header(container).className;

    expect(className).toContain("sticky");
    expect(className).toContain("top-0");
  });

  it("pins the footer so the credit stays reachable", () => {
    const { container } = renderShell();
    const className = footer(container).className;

    expect(className).toContain("sticky");
    expect(className).toContain("bottom-0");
  });

  it("leaves the header clear before anything has scrolled", () => {
    const { container } = renderShell();

    expect(header(container).getAttribute("data-glass")).toBe("false");
  });

  it("frosts the header once the content has scrolled under it", () => {
    const { container } = renderShell();

    act(() => {
      vi.stubGlobal("scrollY", 120);
      globalThis.dispatchEvent(new Event("scroll"));
    });

    expect(header(container).getAttribute("data-glass")).toBe("true");
  });

  it("clears the header again on the way back to the top", () => {
    const { container } = renderShell();

    act(() => {
      vi.stubGlobal("scrollY", 120);
      globalThis.dispatchEvent(new Event("scroll"));
    });
    act(() => {
      vi.stubGlobal("scrollY", 0);
      globalThis.dispatchEvent(new Event("scroll"));
    });

    expect(header(container).getAttribute("data-glass")).toBe("false");
  });

  it("frosts the footer whenever content sits behind it", () => {
    const { container } = renderShell();
    stubViewport(0, { scrollHeight: 2400, innerHeight: 800 });

    act(() => {
      globalThis.dispatchEvent(new Event("scroll"));
    });

    expect(footer(container).getAttribute("data-glass")).toBe("true");
  });

  it("leaves the footer clear when there is nothing to scroll", () => {
    const { container } = renderShell();
    stubViewport(0, { scrollHeight: 800, innerHeight: 800 });

    act(() => {
      globalThis.dispatchEvent(new Event("scroll"));
    });

    expect(footer(container).getAttribute("data-glass")).toBe("false");
  });

  /**
   * The dock is fixed and the footer is now pinned underneath it, so without an
   * explicit offset the chat button sits on top of the credit line. jsdom cannot see
   * that, which is why the rule is asserted against the stylesheet.
   */
  it("keeps the floating dock clear of the pinned footer", () => {
    const theme = readFileSync(
      join(process.cwd(), "src/presentation/styles/theme.css"),
      "utf8",
    );

    expect(theme).toMatch(/\.chat-dock\s*\{[^}]*bottom:\s*calc\(var\(--chrome-height\)/s);
  });

  it("stops listening for scroll once it goes away", () => {
    const remove = vi.spyOn(globalThis, "removeEventListener");
    const { unmount } = renderShell();

    unmount();

    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
});

describe("Shell chrome spacing", () => {
  function renderShell(props: Partial<Parameters<typeof Shell>[0]> = {}) {
    return render(
      <Shell
        errorCode={null}
        locale="en-US"
        onLocaleChange={vi.fn()}
        onLeaveRoom={null}
        onNavigateHome={vi.fn()}
        translate={translate}
        {...props}
      >
        <p>x</p>
      </Shell>,
    );
  }

  function frame(container: Element): Element {
    const element = container.querySelector("[data-frame]");
    if (!element) throw new Error("no frame");
    return element;
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });

  it("leaves the column itself unpadded so the footer can sit flush", () => {
    const { container } = renderShell({ hasFloatingDock: true });

    // Padding on the scrolling column stretches the footer's containing block, which
    // lets sticky float it well above the viewport edge instead of pinning it.
    expect(container.firstElementChild?.className).not.toContain("pb-");
  });

  it("reserves the dock room on the content rather than on the column", () => {
    const { container } = renderShell({ hasFloatingDock: true });

    expect(container.querySelector("main")?.className).toContain("pb-dock");
  });

  it("spaces the content away from the header", () => {
    const { container } = renderShell();

    expect(frame(container).className).toContain("pt-");
  });

  it("spaces the content away from the footer by the same measure", () => {
    const { container } = renderShell();
    const className = frame(container).className;
    const top = /pt-(\w+)/.exec(className);
    const bottom = /pb-(\w+)/.exec(className);

    expect(top?.[1]).toBeTruthy();
    expect(bottom?.[1]).toBe(top?.[1]);
  });

  it("keeps the chrome as thin as the brand block actually needs", () => {
    const theme = readFileSync(
      join(process.cwd(), "src/presentation/styles/theme.css"),
      "utf8",
    );
    const chrome = Number(/--chrome-height:\s*([\d.]+)rem/.exec(theme)?.[1] ?? "0");

    // Tight enough to leave the room its space, loose enough that the disc, the name
    // and the tagline all fit under the wordmark without being clipped.
    expect(chrome).toBeGreaterThanOrEqual(3.25);
    expect(chrome).toBeLessThanOrEqual(3.5);
  });

  it("fits the wordmark inside the chrome it is pinned to", () => {
    const { container } = renderShell();
    const mark = container.querySelector("header svg");
    const height = Number(mark?.getAttribute("height") ?? "0");

    expect(height).toBeLessThanOrEqual(28);
  });
});

describe("Shell room title", () => {
  function renderShell(props: Partial<Parameters<typeof Shell>[0]> = {}) {
    return render(
      <Shell
        errorCode={null}
        locale="en-US"
        onLocaleChange={vi.fn()}
        onLeaveRoom={null}
        onNavigateHome={vi.fn()}
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

  it("keeps the room title out of the scrolling room, since the header holds it", () => {
    const { container } = renderShell({ sessionName: "Sprint 42" });

    expect(container.querySelector("[data-frame]")?.querySelector(".session-name")).toBeNull();
  });

  it("gives the title the header gutter rather than the page one", () => {
    const { container } = renderShell({ sessionName: "Sprint 42" });
    const title = container.querySelector(".session-name");

    expect(title?.className).not.toContain("px-gutter");
  });

  it("gives the header enough height for the wordmark and its tagline", () => {
    const { container } = renderShell();
    const mark = container.querySelector("header svg");
    const theme = readFileSync(
      join(process.cwd(), "src/presentation/styles/theme.css"),
      "utf8",
    );
    const chrome = Number(/--chrome-height:\s*([\d.]+)rem/.exec(theme)?.[1] ?? "0");

    // The display name sits under the disc, so the bar has to clear both of them.
    expect(chrome).toBeGreaterThanOrEqual(3.25);
    expect(Number(mark?.getAttribute("height") ?? "0")).toBeLessThanOrEqual(30);
  });

  it("keeps the language buttons from stretching into tall ovals", () => {
    const { container } = renderShell();
    const button = container.querySelector("header nav button");

    expect(button?.className).toContain("min-h-7");
  });
});

describe("Shell room title in the header", () => {
  function header(container: Element): Element {
    const element = container.querySelector("header");
    if (!element) throw new Error("no header");
    return element;
  }

  function renderShell(sessionName?: string | null) {
    return render(
      <Shell
        errorCode={null}
        locale="en-US"
        onLocaleChange={vi.fn()}
        onLeaveRoom={null}
        onNavigateHome={vi.fn()}
        translate={translate}
        {...(sessionName === undefined ? {} : { sessionName })}
      >
        <p>x</p>
      </Shell>,
    );
  }

  function title(container: Element): Element | null {
    return container.querySelector("[data-room-title]");
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });

  it("puts the room title in the header, where it stays put while the room scrolls", () => {
    const { container } = renderShell("Sprint 42");

    expect(title(container)?.closest("header")).toBeTruthy();
  });

  it("centres the title between the wordmark and the language switcher", () => {
    const { container } = renderShell("Sprint 42");

    expect(title(container)?.className).toContain("text-center");
  });

  it("shows the title once, not again above the room", () => {
    const { container } = renderShell("Sprint 42");

    expect(container.querySelectorAll(".session-name")).toHaveLength(1);
    expect(container.querySelectorAll("[data-room-title]")).toHaveLength(1);
  });

  it("truncates a long title instead of shoving the chrome apart", () => {
    const { container } = renderShell("A".repeat(80));

    expect(title(container)?.className).toContain("truncate");
  });

  it("gives the title a middle track so it can centre on its own", () => {
    const { container } = renderShell("Sprint 42");

    expect(header(container).className).toContain("grid-cols-[1fr_minmax(0,auto)_1fr]");
  });

  it("leaves the title empty when the room has not been named", () => {
    const { container } = renderShell(null);

    expect(title(container)?.textContent).toBe("");
  });

  it("treats an empty name as no name", () => {
    const { container } = renderShell("");

    expect(title(container)?.textContent).toBe("");
  });
});

describe("Shell header tracks", () => {
  function renderShell(sessionName?: string | null) {
    return render(
      <Shell
        errorCode={null}
        locale="en-US"
        onLocaleChange={vi.fn()}
        onLeaveRoom={null}
        onNavigateHome={vi.fn()}
        translate={translate}
        {...(sessionName === undefined ? {} : { sessionName })}
      >
        <p>x</p>
      </Shell>,
    );
  }

  function header(container: Element): Element {
    const element = container.querySelector("header");
    if (!element) throw new Error("no header");
    return element;
  }

  function nav(container: Element): Element {
    const element = container.querySelector("header nav");
    if (!element) throw new Error("no nav");
    return element;
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });

  // Regression: the header is a three track grid so the title can sit in the middle.
  // Dropping the title left the switcher as the second child, which put it in the auto
  // track, and a full bar with no room then had its language picker stranded next to
  // the wordmark instead of against the right edge.
  it("keeps the switcher in the right track when there is no title", () => {
    const { container } = renderShell(null);

    expect([...header(container).children].indexOf(nav(container))).toBe(2);
  });

  it("keeps the switcher in the right track when there is a title", () => {
    const { container } = renderShell("Sprint 42");

    expect([...header(container).children].indexOf(nav(container))).toBe(2);
  });

  it("still reserves the middle track when the room has no name", () => {
    const { container } = renderShell(null);

    expect(header(container).querySelector("[data-room-title]")).toBeTruthy();
  });

  it("aligns the switcher to the end of its track in both cases", () => {
    const { container: bare } = renderShell(null);
    const { container: named } = renderShell("Sprint 42");

    expect(nav(bare).className).toContain("justify-end");
    expect(nav(named).className).toContain("justify-end");
  });
});

describe("Shell room title styling", () => {
  function themeSheet(): string {
    return readFileSync(
      join(process.cwd(), "src/presentation/styles/theme.css"),
      "utf8",
    );
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });

  it("drops the accent dash that used to sit above the title", () => {
    expect(themeSheet()).not.toContain(".session-name::before");
  });

  it("drops the rule that centred the title nowhere in a header", () => {
    expect(themeSheet()).not.toMatch(/\.session-name\s*\{[^}]*text-align:\s*left/s);
  });

  it("stops the title from wrapping, since it sits on one line of chrome", () => {
    expect(themeSheet()).toMatch(/\.session-name\s*\{[^}]*white-space:\s*nowrap/s);
  });

  it("sets the title in the chrome type size rather than the display size", () => {
    const match = /\.session-name\s*\{[^}]*font-size:\s*([^;]+);/s.exec(themeSheet());
    const size = match?.[1] ?? "";

    expect(size).not.toContain("2.2vw");
    expect(size).toContain("0.875rem");
  });
});

describe("Shell title on a phone", () => {
  function renderShell() {
    return render(
      <Shell
        errorCode={null}
        locale="en-US"
        onLocaleChange={vi.fn()}
        onLeaveRoom={null}
        onNavigateHome={vi.fn()}
        sessionName="Sprint 42 planning"
        translate={translate}
      >
        <p>x</p>
      </Shell>,
    );
  }

  function header(container: Element): Element {
    const element = container.querySelector("header");
    if (!element) throw new Error("no header");
    return element;
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });

  // Regression: three tracks and a room name of any length left the middle track with a
  // handful of characters on a phone, so which room you were in became unreadable
  // exactly where it mattered most.
  it("drops the wordmark wording on a phone to give the title the room", () => {
    const { container } = renderShell();
    const wording = container.querySelector("header h1")?.parentElement;

    expect(wording?.className).toContain("hidden");
    expect(wording?.className).toContain("sm:flex");
  });

  it("keeps the wordmark disc, since the brand still has to be there", () => {
    const { container } = renderShell();

    expect(container.querySelector("header svg")).toBeTruthy();
  });

  it("lets the title track shrink rather than pushing the switcher away", () => {
    const { container } = renderShell();

    expect(header(container).className).toContain("minmax(0,auto)");
  });

  it("caps the title so it cannot crowd out the chrome", () => {
    const { container } = renderShell();
    const title = container.querySelector("[data-room-title]");

    expect(title?.className).toContain("max-w-");
  });
});

describe("Shell logo as navigation", () => {
  function renderShell(props: Partial<Parameters<typeof Shell>[0]> = {}) {
    return render(
      <Shell
        errorCode={null}
        locale="en-US"
        onLeaveRoom={null}
        onLocaleChange={vi.fn()}
        onNavigateHome={vi.fn()}
        translate={translate}
        {...props}
      >
        <p>x</p>
      </Shell>,
    );
  }

  function logo(): Element {
    const element = document.querySelector("[data-logo]");
    if (!element) throw new Error("the logo is not a control");
    return element;
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });

  it("makes the logo a control rather than a picture", () => {
    renderShell();

    expect(logo().tagName).toBe("BUTTON");
  });

  it("labels the logo, since a wordmark on its own says nothing to a reader", () => {
    renderShell();

    expect(logo().getAttribute("aria-label")).toBe("Go to the start page");
  });

  it("sends you home from the home screen without asking anything", () => {
    const onNavigateHome = vi.fn();
    renderShell({ onNavigateHome });

    fireEvent.click(logo());

    expect(onNavigateHome).toHaveBeenCalledTimes(1);
  });

  it("does not open the warning while sitting on the home screen", () => {
    renderShell();

    fireEvent.click(logo());

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // Leaving a room drops the seat: the socket closes, and the name only goes to someone
  // else once the grace window passes. So the logo asks first.
  it("asks before taking you out of a room", () => {
    renderShell({ onLeaveRoom: vi.fn() });

    fireEvent.click(logo());

    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("keeps you in the room if you back out", () => {
    const onLeaveRoom = vi.fn();
    const onNavigateHome = vi.fn();
    renderShell({ onLeaveRoom, onNavigateHome });

    fireEvent.click(logo());
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));

    expect(onLeaveRoom).not.toHaveBeenCalled();
    expect(onNavigateHome).not.toHaveBeenCalled();
  });

  it("closes on escape without leaving", () => {
    const onLeaveRoom = vi.fn();
    renderShell({ onLeaveRoom });

    fireEvent.click(logo());
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onLeaveRoom).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves once you confirm", () => {
    const onLeaveRoom = vi.fn();
    renderShell({ onLeaveRoom });

    fireEvent.click(logo());
    fireEvent.click(screen.getByRole("button", { name: "Yes, leave" }));

    expect(onLeaveRoom).toHaveBeenCalledTimes(1);
  });

  it("quotes the grace window, so the cost of leaving is not a surprise", () => {
    renderShell({ onLeaveRoom: vi.fn() });

    fireEvent.click(logo());

    expect(screen.getByRole("dialog").textContent).toContain("5 minutes");
  });

  it("names the room in the warning, so nobody drops out of the wrong one", () => {
    renderShell({ onLeaveRoom: vi.fn(), sessionName: "Sprint 42" });

    fireEvent.click(logo());

    expect(screen.getByRole("dialog").textContent).toContain("Sprint 42");
  });
});
