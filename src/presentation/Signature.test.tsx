import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandMark, Signature } from "@presentation/Signature";
import { createTranslator } from "@application/i18n";
import { BUILD_YEAR } from "@config/version";

const translate = createTranslator("en-US");

describe("BrandMark", () => {
  it("shows the app name", () => {
    render(<BrandMark translate={translate} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Hanko");
  });

  it("shows the slogan", () => {
    render(<BrandMark translate={translate} />);
    expect(screen.getByText("Your team's consensus.")).toBeTruthy();
  });

  it("keeps the name untranslated", () => {
    render(<BrandMark translate={createTranslator("pt-BR")} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Hanko");
  });

  it("translates the slogan", () => {
    render(<BrandMark translate={createTranslator("pt-BR")} />);
    expect(screen.getByText("O consenso da sua equipe.")).toBeTruthy();
  });

  it("keeps the name in the top level heading", () => {
    render(<BrandMark translate={translate} />);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });
});

describe("Signature", () => {
  it("shows the build year", () => {
    render(<Signature translate={translate} />);
    expect(screen.getByText(`© ${BUILD_YEAR}`)).toBeTruthy();
  });

  it("credits the author", () => {
    render(<Signature translate={translate} />);
    expect(screen.getByText(/Made by/)).toBeTruthy();
  });

  it("makes the author name the link", () => {
    render(<Signature translate={translate} />);

    const link = screen.getByRole("link", { name: "skvggor" });
    expect(link.getAttribute("href")).toBe("https://skvggor.dev");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("shows the year beside the credit", () => {
    render(<Signature translate={translate} />);
    expect(screen.getByText(`© ${BUILD_YEAR}`)).toBeTruthy();
  });

  it("shows the heart", () => {
    const { container } = render(<Signature translate={translate} />);
    expect(container.querySelector(".signature__heart")).toBeNull();
    expect(screen.getByLabelText("love").textContent).toBe("with 💜");
  });

  it("labels the heart for screen readers", () => {
    render(<Signature translate={translate} />);
    expect(screen.getByLabelText("love").textContent).toBe("with 💜");
  });

  it("translates the credit line", () => {
    render(<Signature translate={createTranslator("pt-BR")} />);
    expect(screen.getByText(/Feito por/)).toBeTruthy();
  });

  it("keeps the author link in portuguese too", () => {
    render(<Signature translate={createTranslator("pt-BR")} />);
    expect(screen.getByRole("link", { name: "skvggor" }).getAttribute("href")).toBe(
      "https://skvggor.dev",
    );
  });
});