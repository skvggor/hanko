import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
