// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SignUpPage from "./page";

vi.mock("@clerk/nextjs", () => ({
  SignUp: () => <div data-testid="clerk-sign-up">Clerk SignUp</div>,
}));

vi.mock("@/components/Navbar", () => ({
  Navbar: () => <nav data-testid="navbar">Navbar</nav>,
}));

describe("app/sign-up/[[...sign-up]]/page.tsx", () => {
  it("renders Navbar, centered responsive container, Clerk SignUp, and back link", () => {
    const { container } = render(<SignUpPage />);

    // 1. Navbar is rendered
    expect(screen.getByTestId("navbar")).toBeDefined();

    // 2. Clerk SignUp is rendered
    expect(screen.getByTestId("clerk-sign-up")).toBeDefined();

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
    const formWrapper = screen.getByTestId("clerk-sign-up").parentElement;
    expect(formWrapper?.className).toContain("max-w-md");
    expect(formWrapper?.className).toContain("w-full");
  });
});

