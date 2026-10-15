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
