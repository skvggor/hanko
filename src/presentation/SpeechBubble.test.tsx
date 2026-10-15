import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpeechBubble } from "@presentation/SpeechBubble";

describe("SpeechBubble", () => {
  it("renders the message text", () => {
    render(<SpeechBubble text="hello" />);

    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("is hidden from screen readers", () => {
    const { container } = render(<SpeechBubble text="hello" />);

    expect(container.querySelector(".speech-bubble")?.getAttribute("aria-hidden")).toBe("true");
  });
});
