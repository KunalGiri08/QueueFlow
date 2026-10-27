import { describe, it, expect, vi } from "vitest";
import LoginPage from "./page";
import { redirect } from "next/navigation";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("Legacy /login route (app/login/page.tsx)", () => {
  it("redirects directly to /sign-in using Next.js navigation redirect", () => {
    LoginPage();

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });
});
