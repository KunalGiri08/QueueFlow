// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SignInPage from "./page";

vi.mock("@clerk/nextjs", () => ({
  SignIn: () => <div data-testid="clerk-sign-in">Clerk SignIn</div>,
}));

vi.mock("@/components/Navbar", () => ({
  Navbar: () => <nav data-testid="navbar">Navbar</nav>,
}));

describe("app/sign-in/[[...sign-in]]/page.tsx", () => {
  it("renders Navbar, centered responsive container, Clerk SignIn, and back link", () => {
    const { container } = render(<SignInPage />);

    // 1. Navbar is rendered
    expect(screen.getByTestId("navbar")).toBeDefined();

    // 2. Clerk SignIn is rendered
    expect(screen.getByTestId("clerk-sign-in")).toBeDefined();

    // 3. Back to QueueFlow navigation link
    const backLink = screen.getByRole("link", { name: /back to queueflow/i });
    expect(backLink).toBeDefined();
    expect(backLink.getAttribute("href")).toBe("/");

    // 4. Responsive centering and padding container
    const main = container.querySelector("main");
    expect(main).not.toBeNull();
    expect(main?.className).toContain("flex-1");
    expect(main?.className).toContain("items-center");
    expect(main?.className).toContain("justify-center");
    expect(main?.className).toContain("p-4");
    expect(main?.className).toContain("sm:p-6");

    // 5. Constrained width wrapper for mobile safety
    const formWrapper = screen.getByTestId("clerk-sign-in").parentElement;
    expect(formWrapper?.className).toContain("max-w-md");
    expect(formWrapper?.className).toContain("w-full");
  });
});

