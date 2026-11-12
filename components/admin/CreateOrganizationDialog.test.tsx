// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CreateOrganizationDialog, generateSlug } from "./CreateOrganizationDialog";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("CreateOrganizationDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  describe("generateSlug helper", () => {
    it("converts strings to lowercase hyphenated slugs", () => {
      expect(generateSlug("Apex Healthcare")).toBe("apex-healthcare");
      expect(generateSlug("City Clinic & Wellness Center!")).toBe("city-clinic-wellness-center");
      expect(generateSlug("  ---Spaces and Hyphens---  ")).toBe("spaces-and-hyphens");
    });
  });

  it("does not render when isOpen is false", () => {
    render(
      <CreateOrganizationDialog
        isOpen={false}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders when isOpen is true with required fields and accessible attributes", () => {
    render(
      <CreateOrganizationDialog
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("heading", { name: /create organization/i })).toBeDefined();
    expect(screen.getByLabelText(/organization name/i)).toBeDefined();
    expect(screen.getByLabelText(/organization url slug/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /^create organization$/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDefined();
  });

  it("auto-generates slug from name until manually edited", () => {
    render(
      <CreateOrganizationDialog
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    const nameInput = screen.getByLabelText(/organization name/i) as HTMLInputElement;
    const slugInput = screen.getByLabelText(/organization url slug/i) as HTMLInputElement;

    fireEvent.change(nameInput, { target: { value: "Metro Hospital" } });
    expect(slugInput.value).toBe("metro-hospital");

    // Manually edit slug
    fireEvent.change(slugInput, { target: { value: "custom-slug" } });
    expect(slugInput.value).toBe("custom-slug");

    // Changing name now does not overwrite custom slug
    fireEvent.change(nameInput, { target: { value: "Metro Hospital Updated" } });
    expect(slugInput.value).toBe("custom-slug");
  });

  it("validates empty required fields client-side", async () => {
    render(
      <CreateOrganizationDialog
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^create organization$/i }));

    expect(await screen.findByText(/organization name is required/i)).toBeDefined();
    expect(await screen.findByText(/organization slug is required/i)).toBeDefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("validates slug pattern regex client-side", async () => {
    render(
      <CreateOrganizationDialog
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    const nameInput = screen.getByLabelText(/organization name/i);
    const slugInput = screen.getByLabelText(/organization url slug/i);

    fireEvent.change(nameInput, { target: { value: "Valid Name" } });
    fireEvent.change(slugInput, { target: { value: "-invalid-slug-" } });

    fireEvent.click(screen.getByRole("button", { name: /^create organization$/i }));

    expect(
      await screen.findByText(/slug must contain only lowercase letters, numbers, and hyphens/i),
    ).toBeDefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("submits valid form data to POST /api/organizations and calls onSuccess on 201", async () => {
    const mockOnSuccess = vi.fn();
    const mockOnClose = vi.fn();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(
        {
          id: "new-org-123",
          name: "Starlight Clinic",
          slug: "starlight-clinic",
        },
        201,
      ),
    );

    render(
      <CreateOrganizationDialog
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText(/organization name/i), {
      target: { value: "Starlight Clinic" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^create organization$/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Starlight Clinic",
          slug: "starlight-clinic",
        }),
      });
    });

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledWith({
        id: "new-org-123",
        name: "Starlight Clinic",
        slug: "starlight-clinic",
      });
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it("handles 409 conflict error when slug is already taken", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(
        { error: "An organization with this slug already exists" },
        409,
      ),
    );

    render(
      <CreateOrganizationDialog
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/organization name/i), {
      target: { value: "Duplicate Org" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^create organization$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("An organization with this slug already exists");
  });

  it("handles 401 unauthorized by redirecting to sign-in", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ error: "Unauthorized" }, 401),
    );

    render(
      <CreateOrganizationDialog
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/organization name/i), {
      target: { value: "Valid Name" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^create organization$/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/sign-in?redirect_url=%2Fadmin");
    });
  });

  it("handles network error gracefully", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Network failure"),
    );

    render(
      <CreateOrganizationDialog
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/organization name/i), {
      target: { value: "Network Org" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^create organization$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Failed to create organization due to a network error");
  });

  it("calls onClose when Cancel button or Escape key is pressed", () => {
    const mockOnClose = vi.fn();

    render(
      <CreateOrganizationDialog
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mockOnClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(mockOnClose).toHaveBeenCalledTimes(2);
  });
});

