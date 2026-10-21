// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import OrganizationsPage from "./page";

// 1. Mock Next.js navigation with dynamic searchParams
const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();
let mockPathname = "/organizations";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

// 2. Mock Navbar to isolate page testing
vi.mock("@/components/Navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const mockOrgPage1 = {
  id: "org-1",
  name: "Apex Healthcare",
  slug: "apex",
};

const mockOrgPage2 = {
  id: "org-2",
  name: "Beacon Clinic",
  slug: "beacon",
};

function generateOrgs(count: number, prefix: string) {
  return Array.from({ length: count }, (_, idx) => ({
    id: `${prefix}-${idx + 1}`,
    name: `${prefix.toUpperCase()} Organization ${idx + 1}`,
    slug: `${prefix}-${idx + 1}`,
  }));
}

describe("app/organizations/page", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockReset();
    mockSearchParams = new URLSearchParams();
    mockPathname = "/organizations";

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("Loading, populated results, and empty states", () => {
    it("renders loading skeleton while organizations are being fetched", () => {
      const deferred = createDeferred<Response>();
      fetchMock.mockReturnValue(deferred.promise);

      render(<OrganizationsPage />);

      expect(screen.getByLabelText("Loading organizations")).toBeDefined();
    });

    it("displays populated organizations when fetch succeeds", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          organizations: [mockOrgPage1],
          pagination: { page: 1, limit: 20 },
        }),
      );

      render(<OrganizationsPage />);

      expect(await screen.findByText("Apex Healthcare")).toBeDefined();
      expect(screen.getByText("@apex")).toBeDefined();
      expect(
        screen.getByRole("link", { name: "View services at Apex Healthcare" }),
      ).toBeDefined();
      expect(screen.queryByLabelText("Loading organizations")).toBeNull();
    });

    it("displays empty state on page 1 when no organizations exist", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          organizations: [],
          pagination: { page: 1, limit: 20 },
        }),
      );

      render(<OrganizationsPage />);

      expect(await screen.findByText("No organizations found")).toBeDefined();
      expect(
        screen.getByText(
          "There are currently no organizations available on QueueFlow. Please check back later.",
        ),
      ).toBeDefined();
      expect(screen.queryByRole("button", { name: /back to page 1/i })).toBeNull();
    });

    it("displays empty state on page > 1 with Back to Page 1 button", async () => {
      mockSearchParams = new URLSearchParams("page=3");
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          organizations: [],
          pagination: { page: 3, limit: 20 },
        }),
      );

      render(<OrganizationsPage />);

      expect(await screen.findByText("No organizations found")).toBeDefined();
      expect(
        screen.getByText("No organizations found on this page."),
      ).toBeDefined();

      const backButton = screen.getByRole("button", {
        name: /back to page 1/i,
      });
      fireEvent.click(backButton);
      expect(mockPush).toHaveBeenCalledWith("/organizations?page=1");
    });
  });

  describe("Pagination behavior and navigation controls", () => {
    it("disables Previous on page 1 and enables Next when full page of 20 items returned", async () => {
      const fullPageOrgs = generateOrgs(20, "apex");
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          organizations: fullPageOrgs,
          pagination: { page: 1, limit: 20 },
        }),
      );

      render(<OrganizationsPage />);

      await screen.findByText("APEX Organization 1");

      const prevButton = screen.getByRole("button", {
        name: /previous/i,
      }) as HTMLButtonElement;
      const nextButton = screen.getByRole("button", {
        name: /next/i,
      }) as HTMLButtonElement;

      expect(prevButton.disabled).toBe(true);
      expect(nextButton.disabled).toBe(false);

      fireEvent.click(nextButton);
      expect(mockPush).toHaveBeenCalledWith("/organizations?page=2");
    });

    it("disables Next button when fewer than 20 items are returned", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          organizations: [mockOrgPage1],
          pagination: { page: 1, limit: 20 },
        }),
      );

      render(<OrganizationsPage />);

      await screen.findByText("Apex Healthcare");

      const nextButton = screen.getByRole("button", {
        name: /next/i,
      }) as HTMLButtonElement;
      expect(nextButton.disabled).toBe(true);
    });

    it("enables Previous and triggers page decrement when on page 2", async () => {
      mockSearchParams = new URLSearchParams("page=2");
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          organizations: [mockOrgPage2],
          pagination: { page: 2, limit: 20 },
        }),
      );

      render(<OrganizationsPage />);

      await screen.findByText("Beacon Clinic");

      const prevButton = screen.getByRole("button", {
        name: /previous/i,
      }) as HTMLButtonElement;
      expect(prevButton.disabled).toBe(false);

      fireEvent.click(prevButton);
      expect(mockPush).toHaveBeenCalledWith("/organizations?page=1");
    });
  });

  describe("Out-of-order response protection (stale pagination race)", () => {
    it("prevents stale Page 1 response from overwriting active Page 2 data", async () => {
      const deferredPage1 = createDeferred<Response>();
      const deferredPage2 = createDeferred<Response>();

      let capturedSignals: AbortSignal[] = [];

      fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (init?.signal) {
          capturedSignals.push(init.signal);
        }
        if (url.includes("page=1")) {
          return deferredPage1.promise;
        }
        if (url.includes("page=2")) {
          return deferredPage2.promise;
        }
        return Promise.resolve(
          jsonResponse({ organizations: [], pagination: { page: 1, limit: 20 } }),
        );
      });

      // 1. Initial render on Page 1
      mockSearchParams = new URLSearchParams("page=1");
      const { rerender } = render(<OrganizationsPage />);

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/public/organizations?page=1&limit=20",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      const signalPage1 = capturedSignals[0];
      expect(signalPage1.aborted).toBe(false);

      // 2. User navigates to Page 2 while Page 1 request is still in flight
      mockSearchParams = new URLSearchParams("page=2");
      rerender(<OrganizationsPage />);

      // Verify Page 1 request was aborted immediately upon Page 2 initiation
      expect(signalPage1.aborted).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/public/organizations?page=2&limit=20",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );

      // 3. Page 2 resolves first with Page 2 data
      deferredPage2.resolve(
        jsonResponse({
          organizations: [mockOrgPage2],
          pagination: { page: 2, limit: 20 },
        }),
      );

      expect(await screen.findByText("Beacon Clinic")).toBeDefined();
      expect(screen.getByText("@beacon")).toBeDefined();

      // Verify aria-live announcement for Page 2
      const liveRegion = screen.getByRole("status");
      expect(liveRegion.textContent).toBe(
        "Page 2 loaded. Showing 1 organization.",
      );

      // 4. Stale Page 1 request resolves late with Page 1 data
      deferredPage1.resolve(
        jsonResponse({
          organizations: [mockOrgPage1],
          pagination: { page: 1, limit: 20 },
        }),
      );

      // Allow any microtasks to settle
      await waitFor(() => {
        expect(screen.getByText("Beacon Clinic")).toBeDefined();
      });

      // Stale Page 1 data must NOT overwrite Page 2
      expect(screen.queryByText("Apex Healthcare")).toBeNull();
      expect(screen.getByText("Beacon Clinic")).toBeDefined();
      expect(liveRegion.textContent).toBe(
        "Page 2 loaded. Showing 1 organization.",
      );
    });
  });

  describe("Error handling, retry, and AbortError behavior", () => {
    it("displays error banner on server failure and recovers when Retry is clicked", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

      render(<OrganizationsPage />);

      expect(
        await screen.findByText(
          "Unable to load organizations at this time. Please try again.",
        ),
      ).toBeDefined();

      const retryButton = screen.getByRole("button", { name: /retry/i });

      // Setup success response for retry
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          organizations: [mockOrgPage1],
          pagination: { page: 1, limit: 20 },
        }),
      );

      fireEvent.click(retryButton);

      expect(await screen.findByText("Apex Healthcare")).toBeDefined();
      expect(
        screen.queryByText(
          "Unable to load organizations at this time. Please try again.",
        ),
      ).toBeNull();
    });

    it("silently handles AbortError without showing false error banner", async () => {
      const abortError = new DOMException("The user aborted a request.", "AbortError");
      fetchMock.mockRejectedValueOnce(abortError);

      render(<OrganizationsPage />);

      // Wait a tick
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(
        screen.queryByText(
          "Unable to load organizations at this time. Please try again.",
        ),
      ).toBeNull();
    });

    it("aborts in-flight request when component unmounts", () => {
      let capturedSignal: AbortSignal | null = null;
      const deferred = createDeferred<Response>();

      fetchMock.mockImplementation((_: RequestInfo | URL, init?: RequestInit) => {
        capturedSignal = init?.signal ?? null;
        return deferred.promise;
      });

      const { unmount } = render(<OrganizationsPage />);

      expect(capturedSignal).not.toBeNull();
      expect(capturedSignal!.aborted).toBe(false);

      unmount();

      expect(capturedSignal!.aborted).toBe(true);
    });
  });
});
