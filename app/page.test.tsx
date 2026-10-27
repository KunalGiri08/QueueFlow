// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Home from "./page";

vi.mock("@/components/Navbar", () => ({
  Navbar: () => <nav data-testid="navbar">Navbar</nav>,
}));

describe("Homepage (app/page.tsx)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders hero headline and descriptive text", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: /no more waiting in physical queues/i,
      }),
    ).toBeDefined();

    expect(
      screen.getByText(/QueueFlow helps organizations manage virtual queues/i),
    ).toBeDefined();
  });

  it("renders the hero 'Join Queue' CTA pointing directly to /organizations", () => {
    render(<Home />);

    const joinQueueLink = screen.getByRole("link", { name: /^join queue$/i });
    expect(joinQueueLink).toBeDefined();
    expect(joinQueueLink.getAttribute("href")).toBe("/organizations");
    expect(joinQueueLink.getAttribute("href")).not.toBe("/sign-up");
  });
});
