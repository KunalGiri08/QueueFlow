// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { AdminSettings } from "./AdminSettings";
import type { OrganizationItem } from "./OrganizationSelector";

const mockOrg: OrganizationItem = {
  id: "org-123",
  name: "Acme Medical Center",
  slug: "acme-medical",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AdminSettings Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  describe("Access Control & Visibility", () => {
    it("renders organization name as read-only and does not show 'Edit Details' button for non-owners", () => {
      render(
        <AdminSettings
          organization={mockOrg}
          onNavigateSection={vi.fn()}
          isOwner={false}
        />,
      );

      expect(screen.getByText("Acme Medical Center")).toBeDefined();
      expect(
        screen.queryByRole("button", { name: /edit details/i }),
      ).toBeNull();

      // Verify slug and id are clearly present and marked as read-only
      expect(screen.getByText("@acme-medical")).toBeDefined();
      expect(screen.getByText("org-123")).toBeDefined();
      const readOnlyBadges = screen.getAllByText("Read-only");
      expect(readOnlyBadges.length).toBe(2);
    });

    it("shows 'Edit Details' action button when user is the organization OWNER", () => {
      render(
        <AdminSettings
          organization={mockOrg}
          onNavigateSection={vi.fn()}
          isOwner={true}
        />,
      );

      const editBtn = screen.getByRole("button", { name: /edit details/i });
      expect(editBtn).toBeDefined();
    });

    it("resolves ownership status dynamically from API when isOwner prop is not passed", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        jsonResponse({
          id: "org-123",
          name: "Acme Medical Center",
          slug: "acme-medical",
          isOwner: true,
        }),
      );

      render(
        <AdminSettings
          organization={mockOrg}
          onNavigateSection={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /edit details/i }),
        ).toBeDefined();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/organizations/org-123",
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });
  });

  describe("Editing Flow", () => {
    it("opens edit mode with pre-filled name, Save, and Cancel buttons", () => {
      render(
        <AdminSettings
          organization={mockOrg}
          onNavigateSection={vi.fn()}
          isOwner={true}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /edit details/i }));

      const input = screen.getByPlaceholderText(
        "Organization name",
      ) as HTMLInputElement;
      expect(input).toBeDefined();
      expect(input.value).toBe("Acme Medical Center");

      expect(screen.getByRole("button", { name: /^save$/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /^cancel$/i })).toBeDefined();
    });

    it("cancels editing and restores previous name without saving", () => {
      render(
        <AdminSettings
          organization={mockOrg}
          onNavigateSection={vi.fn()}
          isOwner={true}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /edit details/i }));

      const input = screen.getByPlaceholderText("Organization name");
      fireEvent.change(input, { target: { value: "Discarded Changes" } });

      fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

      // Form closed, original name displayed
      expect(
        screen.queryByPlaceholderText("Organization name"),
      ).toBeNull();
      expect(screen.getByText("Acme Medical Center")).toBeDefined();
      expect(screen.queryByText("Discarded Changes")).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("validates empty name on client side and prevents submission", async () => {
      render(
        <AdminSettings
          organization={mockOrg}
          onNavigateSection={vi.fn()}
          isOwner={true}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /edit details/i }));

      const input = screen.getByPlaceholderText("Organization name");
      fireEvent.change(input, { target: { value: "    " } });

      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

      expect(
        await screen.findByText("Organization name is required"),
      ).toBeDefined();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("validates name exceeding 100 characters on client side", async () => {
      render(
        <AdminSettings
          organization={mockOrg}
          onNavigateSection={vi.fn()}
          isOwner={true}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /edit details/i }));

      const input = screen.getByPlaceholderText("Organization name");
      fireEvent.change(input, { target: { value: "a".repeat(101) } });

      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

      expect(
        await screen.findByText("Organization name must be 100 characters or fewer"),
      ).toBeDefined();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("successfully saves updated name, updates view, and triggers onOrganizationUpdated callback", async () => {
      const onOrganizationUpdated = vi.fn();

      vi.mocked(global.fetch).mockResolvedValueOnce(
        jsonResponse({
          id: "org-123",
          name: "Acme Global Health",
          slug: "acme-medical",
          ownerId: "user-owner",
        }),
      );

      render(
        <AdminSettings
          organization={mockOrg}
          onNavigateSection={vi.fn()}
          onOrganizationUpdated={onOrganizationUpdated}
          isOwner={true}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /edit details/i }));

      const input = screen.getByPlaceholderText("Organization name");
      fireEvent.change(input, { target: { value: "  Acme Global Health  " } });

      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/organizations/org-123",
          expect.objectContaining({
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Acme Global Health" }),
          }),
        );
      });

      await waitFor(() => {
        expect(screen.getByText("Acme Global Health")).toBeDefined();
        expect(
          screen.getByText("Organization name updated successfully."),
        ).toBeDefined();
      });

      expect(onOrganizationUpdated).toHaveBeenCalledWith({
        id: "org-123",
        name: "Acme Global Health",
        slug: "acme-medical",
      });
    });

    it("handles server error and displays error message while remaining in edit mode", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        jsonResponse(
          {
            error:
              "Forbidden: Only the organization owner can update the organization name",
          },
          403,
        ),
      );

      render(
        <AdminSettings
          organization={mockOrg}
          onNavigateSection={vi.fn()}
          isOwner={true}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /edit details/i }));

      const input = screen.getByPlaceholderText("Organization name");
      fireEvent.change(input, { target: { value: "Hacked Org Name" } });

      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

      await waitFor(() => {
        expect(
          screen.getByText(
            "Forbidden: Only the organization owner can update the organization name",
          ),
        ).toBeDefined();
      });

      // Still in edit mode so user can correct or cancel
      expect(
        screen.getByPlaceholderText("Organization name"),
      ).toBeDefined();
    });
  });
});
