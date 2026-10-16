import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CAT_BREEDS } from "@domain/cat";
import { CatSprite } from "@presentation/CatSprite";

describe("CatSprite", () => {
  it("renders an svg for every breed", () => {
    for (const breed of CAT_BREEDS) {
      const { container } = render(<CatSprite breed={breed} />);

      expect(container.querySelector("svg")).toBeTruthy();
    }
  });

  it("hides the sprite from screen readers", () => {
    const { container } = render(<CatSprite breed="tabby" />);

    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("draws closed eyes when sleeping", () => {
    const { container } = render(<CatSprite activity="sleeping" breed="tabby" />);
    const svg = container.querySelector("svg");

    expect(svg?.classList.contains("cat-sprite--sleeping")).toBe(true);
    expect(container.querySelector(".olhos-fechados")).not.toBeNull();
    expect(container.querySelector(".olhos-abertos")).not.toBeNull();
  });
});

describe("CatSprite styling", () => {
  function renderSprite(count: number) {
    return render(
      <>
        {Array.from({ length: count }, (_, index) => (
          <CatSprite
            activity="walking"
            breed={CAT_BREEDS[index % CAT_BREEDS.length] ?? "tabby"}
            direction="right"
            key={index}
          />
        ))}
      </>,
    );
  }

  /**
   * The sprite used to inject its stylesheet into every instance, so a room of ten
   * cats parsed ten identical copies of the same six animations. None of them depend
   * on anything a sprite owns, so they belong to the theme and load once.
   */
  it("does not carry its own stylesheet", () => {
    const { container } = renderSprite(3);

    expect(container.querySelectorAll("style")).toHaveLength(0);
  });

  /**
   * A DOM id has to be unique, and every cat in the room drew the same two. Nothing
   * ever pointed at them, so they were only ever invalid.
   */
  it("does not stamp the same element id onto every cat", () => {
    const { container } = renderSprite(4);
    const ids = [...container.querySelectorAll("[id]")].map((element) => element.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
