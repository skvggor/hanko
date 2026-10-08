import { act } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * main.tsx runs the whole boot on import, so every test has to import it fresh and
 * has to describe the environment before the import happens. That is the cost of
 * testing an entry point, and it is worth paying once: the mount point and the
 * default export are exactly what index.html depends on.
 */
describe("main", () => {
  beforeAll(async () => {
    /**
     * The first dynamic import of the entry point drags the whole component tree
     * through the transform pipeline. Measured under the load of a pre-push hook, which
     * runs lint, typecheck, coverage and the build at the same time, that single import
     * took over six seconds and blew the default timeout before a single assertion ran.
     *
     * Paying it once here, outside any test, is what keeps the assertions honest.
     * resetModules hands each test a fresh registry, so the throwing case still
     * re-evaluates the module and still throws for the reason it is testing.
     */
    await import("@presentation/main").catch(() => {});
    vi.resetModules();
  });

  beforeEach(() => {
    vi.stubGlobal("location", {
      origin: "https://hanko.skvggor.workers.dev",
      pathname: "/",
      protocol: "https:",
    });
    vi.stubGlobal("history", { pushState: vi.fn() });
    vi.stubGlobal("navigator", { language: "en-US" });
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
    vi.stubGlobal("sessionStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  });

  afterEach(() => {
    vi.resetModules();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  function mountPoint(): HTMLDivElement {
    const element = document.createElement("div");
    element.id = "root";
    document.body.appendChild(element);
    return element;
  }

  it("refuses to boot without the mount point", async () => {
    document.body.innerHTML = "";

    await expect(import("@presentation/main")).rejects.toThrow("missing #root element");
  });

  it("boots the app into the mount point", async () => {
    const root = mountPoint();

    await act(async () => {
      await import("@presentation/main");
    });

    expect(root.textContent).not.toBe("");
  });

  it("boots the landing page, since that is the default route", async () => {
    const root = mountPoint();

    await act(async () => {
      await import("@presentation/main");
    });

    expect(root.textContent).toContain("Start a room");
  });

  it("marks the document as the language it booted in", async () => {
    mountPoint();

    await act(async () => {
      await import("@presentation/main");
    });

    expect(document.documentElement.getAttribute("lang")).toBe("en-US");
  });

  it("picks up a room route from the url it was served on", async () => {
    vi.stubGlobal("location", {
      origin: "https://hanko.skvggor.workers.dev",
      pathname: "/room/abcd2345",
      protocol: "https:",
    });
    const root = mountPoint();

    await act(async () => {
      await import("@presentation/main");
    });

    // A deep link is served the same index.html, so the router has to read the path
    // on boot rather than waiting for a navigation that will never come.
    expect(root.textContent).toContain("What is your name?");
  });
});