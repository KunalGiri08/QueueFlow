// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act, within } from "@testing-library/react";
import OrganizationServicesPage, {
  formatAdmissionErrorMessage,
} from "./page";

// 1. Mock Next.js navigation with dynamic params
const mockPush = vi.fn();
let mockParams = { organizationId: "org-123" };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => mockParams,
}));

// 2. Mock Clerk authentication
let mockIsSignedIn = true;
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: mockIsSignedIn }),
}));

// 3. Mock Navbar to isolate page testing
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

const mockOrg = {
  id: "org-123",
  name: "Apex Healthcare",
  slug: "apex",
};

const mockCatalogData = {
  organization: mockOrg,
  services: [
    {
      id: "srv-1",
      name: "General Consultation",
      description: "Walk-in consultations with a GP",
      queues: [
        { id: "q-1", name: "Standard Line", isActive: true },
        { id: "q-2", name: "Priority Line", isActive: true },
      ],
    },
    {
      id: "srv-2",
      name: "Pharmacy",
      description: null,
      queues: [
        { id: "q-3", name: "Prescription Pickup", isActive: true },
      ],
    },
  ],
};

async function renderPage(orgId = "org-123") {
  mockParams = { organizationId: orgId };
  const paramsPromise = Promise.resolve({ organizationId: orgId });
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(<OrganizationServicesPage params={paramsPromise} />);
  });
  return result!;
}

function renderPageSync(orgId = "org-123") {
  mockParams = { organizationId: orgId };
  const paramsPromise = Promise.resolve({ organizationId: orgId });
  return render(<OrganizationServicesPage params={paramsPromise} />);
}

describe("app/organizations/[organizationId]/page", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockReset();
    mockIsSignedIn = true;
    mockParams = { organizationId: "org-123" };

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("A. Catalog request lifecycle, loading, and rendering", () => {
    it("renders loading skeleton while catalog is being fetched", async () => {
      const deferred = createDeferred<Response>();
      fetchMock.mockReturnValue(deferred.promise);

      await act(async () => {
        renderPageSync();
      });

      expect(screen.getByLabelText("Loading services")).toBeDefined();
    });

    it("displays populated organization catalog, services, and queues when fetch succeeds", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(mockCatalogData));

      await renderPage();

      expect(screen.getByText("Apex Healthcare")).toBeDefined();
      expect(screen.getByText("@apex")).toBeDefined();
      expect(screen.getByText("General Consultation")).toBeDefined();
      expect(screen.getByText("Walk-in consultations with a GP")).toBeDefined();
      expect(screen.getByText("Pharmacy")).toBeDefined();
      expect(screen.getByText("Standard Line")).toBeDefined();
      expect(screen.getByText("Priority Line")).toBeDefined();
      expect(screen.getByText("Prescription Pickup")).toBeDefined();
      expect(screen.queryByLabelText("Loading services")).toBeNull();
    });

    it("displays empty services state when organization has no services", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          organization: mockOrg,
          services: [],
        }),
      );

      await renderPage();

      expect(screen.getByText("No services available")).toBeDefined();
      expect(
        screen.getByText(
          "This organization does not currently have any services listed. Please check back later.",
        ),
      ).toBeDefined();
      const backLinks = screen.getAllByRole("link", {
        name: /Back to Organizations/i,
      });
      expect(backLinks.length).toBeGreaterThanOrEqual(1);
    });

    it("displays 'No active queues' when a service has an empty queues array", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          organization: mockOrg,
          services: [
            {
              id: "srv-empty",
              name: "Information Desk",
              description: "General queries",
              queues: [],
            },
          ],
        }),
      );

      await renderPage();

      expect(screen.getByText("Information Desk")).toBeDefined();
      expect(screen.getByText("No active queues")).toBeDefined();
    });

    it("defensively excludes queues marked inactive from being rendered as joinable", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          organization: mockOrg,
          services: [
            {
              id: "srv-defensive",
              name: "General Consultation",
              description: "Walk-in consultations",
              queues: [
                { id: "q-active", name: "Active Queue", isActive: true },
                { id: "q-inactive", name: "Inactive Queue", isActive: false },
                { id: "q-legacy", name: "Legacy Queue" },
              ],
            },
            {
              id: "srv-all-inactive",
              name: "Pharmacy",
              description: null,
              queues: [
                { id: "q-only-inactive", name: "Closed Queue", isActive: false },
              ],
            },
          ],
        }),
      );

      await renderPage();

      expect(screen.getByText("Active Queue")).toBeDefined();
      expect(screen.getByRole("button", { name: "Join Active Queue" })).toBeDefined();

      expect(screen.getByText("Legacy Queue")).toBeDefined();
      expect(screen.getByRole("button", { name: "Join Legacy Queue" })).toBeDefined();

      expect(screen.queryByText("Inactive Queue")).toBeNull();
      expect(screen.queryByRole("button", { name: "Join Inactive Queue" })).toBeNull();

      expect(screen.queryByText("Closed Queue")).toBeNull();
      expect(screen.getByText("No active queues")).toBeDefined();
    });

    it("displays 404 organization not found state with back link", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Organization not found" }), {
          status: 404,
        }),
      );

      await renderPage();

      expect(screen.getByText("Organization not found")).toBeDefined();
      expect(
        screen.getByText(
          "The organization you are looking for does not exist or may have been removed.",
        ),
      ).toBeDefined();
      const backLinks = screen.getAllByRole("link", {
        name: /Back to Organizations/i,
      });
      expect(backLinks.length).toBeGreaterThanOrEqual(1);
    });

    it("displays 500 error alert and allows retrying catalog fetch", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("Internal Server Error", { status: 500 }),
      );

      await renderPage();

      expect(
        screen.getByText("Unable to load services at this time. Please try again."),
      ).toBeDefined();
      expect(screen.getByRole("alert")).toBeDefined();

      // Retry succeeding
      fetchMock.mockResolvedValueOnce(jsonResponse(mockCatalogData));
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));

      expect(await screen.findByText("Apex Healthcare")).toBeDefined();
      expect(
        screen.queryByText("Unable to load services at this time. Please try again."),
      ).toBeNull();
    });

    it("aborts pending catalog request on unmount and handles AbortError silently", async () => {
      let capturedSignal: AbortSignal | null | undefined;
      const deferred = createDeferred<Response>();
      fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
        capturedSignal = init?.signal;
        return deferred.promise;
      });

      let unmount!: () => void;
      await act(async () => {
        const res = render(
          <OrganizationServicesPage
            params={Promise.resolve({ organizationId: "org-123" })}
          />,
        );
        unmount = res.unmount;
      });

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal?.aborted).toBe(false);

      act(() => {
        unmount();
      });

      expect(capturedSignal?.aborted).toBe(true);

      const abortError = new Error("The user aborted a request.");
      abortError.name = "AbortError";
      deferred.reject(abortError);

      // Verify no unhandled errors or alerts rendered
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("disregards out-of-order stale catalog response when organization identity changes", async () => {
      const deferredOrg1 = createDeferred<Response>();
      const deferredOrg2 = createDeferred<Response>();

      fetchMock.mockImplementation((url: string) => {
        if (url.includes("org-1")) return deferredOrg1.promise;
        if (url.includes("org-2")) return deferredOrg2.promise;
        return Promise.reject(new Error("Unexpected URL"));
      });

      mockParams = { organizationId: "org-1" };
      let rerenderFn!: (ui: React.ReactElement) => void;
      await act(async () => {
        const res = render(
          <OrganizationServicesPage
            params={Promise.resolve({ organizationId: "org-1" })}
          />,
        );
        rerenderFn = res.rerender;
      });

      // Organization changes to org-2
      mockParams = { organizationId: "org-2" };
      await act(async () => {
        rerenderFn(
          <OrganizationServicesPage
            params={Promise.resolve({ organizationId: "org-2" })}
          />,
        );
      });

      // org-2 resolves first
      const org2Data = {
        organization: {
          id: "org-2",
          name: "Beacon Clinic",
          slug: "beacon",
        },
        services: [],
      };
      await act(async () => {
        deferredOrg2.resolve(jsonResponse(org2Data));
      });

      expect(screen.getByText("Beacon Clinic")).toBeDefined();

      // org-1 resolves later (stale response)
      await act(async () => {
        deferredOrg1.resolve(jsonResponse(mockCatalogData));
      });

      // org-2 data remains active and was not overwritten by stale org-1
      expect(screen.getByText("Beacon Clinic")).toBeDefined();
      expect(screen.queryByText("Apex Healthcare")).toBeNull();
    });
  });

  describe("B. Defensive response validation", () => {
    it("safely displays error alert when organization object is malformed", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          organization: { id: "", name: 123, slug: null },
          services: [],
        }),
      );

      await renderPage();

      expect(
        screen.getByText("Unable to load services at this time. Please try again."),
      ).toBeDefined();
      expect(screen.queryByText("Apex Healthcare")).toBeNull();
    });

    it("safely displays error alert when service item is missing required fields", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          organization: mockOrg,
          services: [
            {
              id: "srv-bad",
              // missing name and queues
            },
          ],
        }),
      );

      await renderPage();

      expect(
        screen.getByText("Unable to load services at this time. Please try again."),
      ).toBeDefined();
    });

    it("safely displays error alert when nested queue item is malformed", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          organization: mockOrg,
          services: [
            {
              id: "srv-1",
              name: "General Consultation",
              description: null,
              queues: [
                {
                  id: "q-bad",
                  name: "Bad Queue",
                  isActive: "not-a-boolean", // malformed isActive
                },
              ],
            },
          ],
        }),
      );

      await renderPage();

      expect(
        screen.getByText("Unable to load services at this time. Please try again."),
      ).toBeDefined();
    });

    it("safely displays error alert when response body is not an object", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse("Not an object"));

      await renderPage();

      expect(
        screen.getByText("Unable to load services at this time. Please try again."),
      ).toBeDefined();
    });
  });

  describe("C. Queue joining concurrency, authentication, and responses", () => {
    it("redirects unauthenticated user to sign-in without calling POST /api/tickets", async () => {
      mockIsSignedIn = false;
      fetchMock.mockResolvedValueOnce(jsonResponse(mockCatalogData));

      await renderPage();

      const joinBtn = screen.getByRole("button", { name: "Join Standard Line" });
      fireEvent.click(joinBtn);

      expect(mockPush).toHaveBeenCalledWith(
        `/sign-in?redirect_url=${encodeURIComponent("/organizations/org-123")}`,
      );
      // Ensure POST /api/tickets is not called for unauthenticated user
      expect(fetchMock).not.toHaveBeenCalledWith(
        "/api/tickets",
        expect.anything(),
      );
    });

    it("successfully creates ticket (201) and navigates to tracking page", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/services")) {
          return jsonResponse(mockCatalogData);
        }
        if (url === "/api/tickets" && init?.method === "POST") {
          return jsonResponse({ trackingToken: "trk-token-xyz-123" }, 201);
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      const joinBtn = screen.getByRole("button", { name: "Join Standard Line" });
      fireEvent.click(joinBtn);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/tickets/track/trk-token-xyz-123");
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tickets",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ queueId: "q-1" }),
        }),
      );
    });

    it("displays error when 201 response has missing trackingToken", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/services")) return jsonResponse(mockCatalogData);
        if (url === "/api/tickets" && init?.method === "POST") {
          return jsonResponse({}, 201);
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Join Standard Line" }));

      expect(
        await screen.findByText(
          "Ticket created, but tracking information is unavailable.",
        ),
      ).toBeDefined();
    });

    it("redirects to sign-in on 401 response during queue join", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/services")) return jsonResponse(mockCatalogData);
        if (url === "/api/tickets" && init?.method === "POST") {
          return new Response(null, { status: 401 });
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Join Standard Line" }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          `/sign-in?redirect_url=${encodeURIComponent("/organizations/org-123")}`,
        );
      });
    });

    it("handles 404 response on queue join with descriptive error and aria-describedby", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/services")) return jsonResponse(mockCatalogData);
        if (url === "/api/tickets" && init?.method === "POST") {
          return new Response(null, { status: 404 });
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      const joinBtn = screen.getByRole("button", { name: "Join Standard Line" });
      expect(joinBtn.getAttribute("aria-describedby")).toBeNull();

      fireEvent.click(joinBtn);

      const errorMsg = await screen.findByText(
        "This queue is no longer active or could not be found. Please refresh the page.",
      );
      expect(errorMsg).toBeDefined();

      expect(joinBtn.getAttribute("aria-describedby")).toBe("queue-error-q-1");
      const alertContainer = screen.getByRole("alert");
      expect(alertContainer.getAttribute("id")).toBe("queue-error-q-1");
    });

    it("displays server-provided error message when queue join returns HTTP 400", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/services")) return jsonResponse(mockCatalogData);
        if (url === "/api/tickets" && init?.method === "POST") {
          return jsonResponse(
            { error: "Service category is not active" },
            400,
          );
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Join Standard Line" }));

      expect(
        await screen.findByText("Service category is not active"),
      ).toBeDefined();
    });

    it("displays generic fallback error message when queue join returns HTTP 400 without error text", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/services")) return jsonResponse(mockCatalogData);
        if (url === "/api/tickets" && init?.method === "POST") {
          return new Response("Bad Request", { status: 400 });
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Join Standard Line" }));

      expect(
        await screen.findByText(
          "Unable to join the queue at this time. Please try again.",
        ),
      ).toBeDefined();
    });

    it("handles 409 conflict response with custom API message and fallback", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/services")) return jsonResponse(mockCatalogData);
        if (url === "/api/tickets" && init?.method === "POST") {
          return jsonResponse(
            { error: "You are already queued in this service line." },
            409,
          );
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Join Standard Line" }));

      expect(
        await screen.findByText("You are already queued in this service line."),
      ).toBeDefined();
    });

    it("handles 409 conflict response fallback when response body is empty or non-JSON", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/services")) return jsonResponse(mockCatalogData);
        if (url === "/api/tickets" && init?.method === "POST") {
          return new Response("Conflict", { status: 409 });
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Join Standard Line" }));

      expect(
        await screen.findByText("You already have an active ticket in this queue."),
      ).toBeDefined();
    });

    it("handles 500 error response during queue join", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/services")) return jsonResponse(mockCatalogData);
        if (url === "/api/tickets" && init?.method === "POST") {
          return new Response("Server error", { status: 500 });
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Join Standard Line" }));

      expect(
        await screen.findByText(
          "Unable to join the queue at this time. Please try again.",
        ),
      ).toBeDefined();
    });

    it("handles network failure during queue join", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/services")) return jsonResponse(mockCatalogData);
        if (url === "/api/tickets" && init?.method === "POST") {
          throw new Error("Network disconnection");
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Join Standard Line" }));

      expect(
        await screen.findByText(
          "Unable to join the queue at this time. Please check your connection and try again.",
        ),
      ).toBeDefined();
    });
  });

  describe("D. Concurrency guards, loading state, and error dismissal on retry", () => {
    it("shows loading indicator and disables all join buttons while a queue join is in progress", async () => {
      const deferredTicket = createDeferred<Response>();
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/services")) return jsonResponse(mockCatalogData);
        if (url === "/api/tickets" && init?.method === "POST") {
          return deferredTicket.promise;
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      const btnQ1 = screen.getByRole("button", { name: "Join Standard Line" });
      const btnQ2 = screen.getByRole("button", { name: "Join Priority Line" });
      const btnQ3 = screen.getByRole("button", { name: "Join Prescription Pickup" });

      fireEvent.click(btnQ1);

      expect(
        screen.getByRole("button", { name: "Joining Standard Line..." }),
      ).toBeDefined();
      expect((btnQ1 as HTMLButtonElement).disabled).toBe(true);
      expect((btnQ2 as HTMLButtonElement).disabled).toBe(true);
      expect((btnQ3 as HTMLButtonElement).disabled).toBe(true);

      await act(async () => {
        deferredTicket.resolve(jsonResponse({ trackingToken: "trk-finish" }, 201));
      });
    });

    it("synchronously blocks duplicate join requests across different queues", async () => {
      const deferredTicket = createDeferred<Response>();
      let postCount = 0;

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/services")) return jsonResponse(mockCatalogData);
        if (url === "/api/tickets" && init?.method === "POST") {
          postCount++;
          return deferredTicket.promise;
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      const btnQ1 = screen.getByRole("button", { name: "Join Standard Line" });
      const btnQ2 = screen.getByRole("button", { name: "Join Priority Line" });

      // Synchronous rapid clicks on different queues
      fireEvent.click(btnQ1);
      fireEvent.click(btnQ2);
      fireEvent.click(btnQ1);

      // Only one ticket POST was dispatched
      expect(postCount).toBe(1);

      await act(async () => {
        deferredTicket.resolve(new Response("Server error", { status: 500 }));
      });
    });

    it("dismisses previous queue error on retry for that queue", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/services")) return jsonResponse(mockCatalogData);
        if (url === "/api/tickets" && init?.method === "POST") {
          return new Response("Error", { status: 500 });
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      const btnQ1 = screen.getByRole("button", { name: "Join Standard Line" });
      fireEvent.click(btnQ1);

      expect(
        await screen.findByText(
          "Unable to join the queue at this time. Please try again.",
        ),
      ).toBeDefined();

      const deferredSecond = createDeferred<Response>();
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === "/api/tickets" && init?.method === "POST") {
          return deferredSecond.promise;
        }
        return new Response("Not found", { status: 404 });
      });

      // Retry clicking the same queue
      fireEvent.click(btnQ1);

      // Error message should be dismissed immediately upon retry click
      expect(
        screen.queryByText("Unable to join the queue at this time. Please try again."),
      ).toBeNull();

      await act(async () => {
        deferredSecond.resolve(jsonResponse({ trackingToken: "trk-ok" }, 201));
      });
    });

    it("does not update state when organization identity changes while join request is in flight", async () => {
      const deferredTicket = createDeferred<Response>();
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("org-1/services")) return jsonResponse(mockCatalogData);
        if (url.includes("org-2/services")) {
          return jsonResponse({
            organization: {
              id: "org-2",
              name: "Beacon Clinic",
              slug: "beacon",
            },
            services: [],
          });
        }
        if (url === "/api/tickets" && init?.method === "POST") {
          return deferredTicket.promise;
        }
        return new Response("Not found", { status: 404 });
      });

      mockParams = { organizationId: "org-1" };
      let rerenderFn!: (ui: React.ReactElement) => void;
      await act(async () => {
        const res = render(
          <OrganizationServicesPage
            params={Promise.resolve({ organizationId: "org-1" })}
          />,
        );
        rerenderFn = res.rerender;
      });

      expect(await screen.findByText("Apex Healthcare")).toBeDefined();

      const btnQ1 = screen.getByRole("button", { name: "Join Standard Line" });
      fireEvent.click(btnQ1);

      // While ticket POST is in flight, switch organization to org-2
      mockParams = { organizationId: "org-2" };
      await act(async () => {
        rerenderFn(
          <OrganizationServicesPage
            params={Promise.resolve({ organizationId: "org-2" })}
          />,
        );
      });

      expect(await screen.findByText("Beacon Clinic")).toBeDefined();

      // In-flight ticket POST for org-1 now resolves with an error
      await act(async () => {
        deferredTicket.resolve(new Response("Error", { status: 500 }));
      });

      // No stale error alert is displayed on org-2
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  describe("E. Customer appointment booking", () => {
    it("renders Book Appointment button alongside queues for each service", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(mockCatalogData));
      await renderPage();

      const bookButtons = screen.getAllByRole("button", {
        name: /book appointment/i,
      });
      expect(bookButtons.length).toBe(2);
      expect(
        screen.getByRole("button", {
          name: "Book appointment for General Consultation",
        }),
      ).toBeDefined();
      expect(
        screen.getByRole("button", {
          name: "Book appointment for Pharmacy",
        }),
      ).toBeDefined();
    });

    it("redirects to sign-in when unauthenticated user clicks Book Appointment", async () => {
      mockIsSignedIn = false;
      fetchMock.mockResolvedValueOnce(jsonResponse(mockCatalogData));
      await renderPage();

      const bookBtn = screen.getByRole("button", {
        name: "Book appointment for General Consultation",
      });
      fireEvent.click(bookBtn);

      expect(mockPush).toHaveBeenCalledWith(
        "/sign-in?redirect_url=%2Forganizations%2Forg-123",
      );
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("opens BookAppointmentDialog when authenticated user clicks Book Appointment", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(mockCatalogData));
      await renderPage();

      const bookBtn = screen.getByRole("button", {
        name: "Book appointment for General Consultation",
      });
      fireEvent.click(bookBtn);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();
      expect(
        within(dialog).getByRole("heading", { name: "Book Appointment" }),
      ).toBeDefined();
      expect(within(dialog).getByText("Apex Healthcare")).toBeDefined();
      expect(within(dialog).getByText(/General Consultation/)).toBeDefined();
    });

    it("books appointment successfully: sends POST /api/appointments and displays confirmation with navigation link", async () => {
      let postBody: unknown = null;
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === "/api/public/organizations/org-123/services") {
          return jsonResponse(mockCatalogData);
        }
        if (url === "/api/appointments" && init?.method === "POST") {
          postBody = JSON.parse(init.body as string);
          return jsonResponse(
            {
              id: "appt-new-123",
              serviceId: "srv-1",
              userId: "user-1",
              scheduledAt: (postBody as { scheduledAt: string }).scheduledAt,
              status: "BOOKED",
            },
            201,
          );
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      const bookBtn = screen.getByRole("button", {
        name: "Book appointment for General Consultation",
      });
      fireEvent.click(bookBtn);

      const input = screen.getByLabelText(/appointment date and time/i);
      const future = new Date(Date.now() + 3 * 86_400_000);
      const local = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}T11:00`;
      fireEvent.change(input, { target: { value: local } });

      const confirmBtn = screen.getByRole("button", {
        name: /confirm booking/i,
      });
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      expect(postBody).toEqual({
        serviceId: "srv-1",
        scheduledAt: expect.any(String),
      });

      expect(screen.getByText("Appointment Booked!")).toBeDefined();
      const viewLink = screen.getByRole("link", {
        name: /view my appointments/i,
      });
      expect(viewLink.getAttribute("href")).toBe("/appointments");
    });

    it("handles 409 conflict: displays slot booked message in dialog without losing selected date", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === "/api/public/organizations/org-123/services") {
          return jsonResponse(mockCatalogData);
        }
        if (url === "/api/appointments" && init?.method === "POST") {
          return jsonResponse(
            { error: "This appointment time slot is already booked" },
            409,
          );
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      const bookBtn = screen.getByRole("button", {
        name: "Book appointment for General Consultation",
      });
      fireEvent.click(bookBtn);

      const input = screen.getByLabelText(/appointment date and time/i);
      const future = new Date(Date.now() + 3 * 86_400_000);
      const local = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}T11:00`;
      fireEvent.change(input, { target: { value: local } });

      const confirmBtn = screen.getByRole("button", {
        name: /confirm booking/i,
      });
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(
        "This appointment time slot is already booked",
      );
      expect(screen.getByRole("dialog")).toBeDefined();
      expect(
        screen.getByLabelText<HTMLInputElement>(/appointment date and time/i)
          .value,
      ).not.toBe("");
    });

    it("handles 400 validation error from server", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === "/api/public/organizations/org-123/services") {
          return jsonResponse(mockCatalogData);
        }
        if (url === "/api/appointments" && init?.method === "POST") {
          return jsonResponse(
            {
              error: "Invalid request body",
              details: {
                fieldErrors: {
                  scheduledAt: [
                    "Appointment cannot be scheduled more than 365 days in advance",
                  ],
                },
              },
            },
            400,
          );
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      const bookBtn = screen.getByRole("button", {
        name: "Book appointment for General Consultation",
      });
      fireEvent.click(bookBtn);

      const input = screen.getByLabelText(/appointment date and time/i);
      const future = new Date(Date.now() + 3 * 86_400_000);
      const local = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}T11:00`;
      fireEvent.change(input, { target: { value: local } });

      const confirmBtn = screen.getByRole("button", {
        name: /confirm booking/i,
      });
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(
        "Appointment cannot be scheduled more than 365 days in advance",
      );
    });

    it("redirects to sign-in when POST /api/appointments returns 401", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === "/api/public/organizations/org-123/services") {
          return jsonResponse(mockCatalogData);
        }
        if (url === "/api/appointments" && init?.method === "POST") {
          return jsonResponse({ error: "Unauthorized" }, 401);
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      const bookBtn = screen.getByRole("button", {
        name: "Book appointment for General Consultation",
      });
      fireEvent.click(bookBtn);

      const input = screen.getByLabelText(/appointment date and time/i);
      const future = new Date(Date.now() + 3 * 86_400_000);
      const local = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}T11:00`;
      fireEvent.change(input, { target: { value: local } });

      const confirmBtn = screen.getByRole("button", {
        name: /confirm booking/i,
      });
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      expect(mockPush).toHaveBeenCalledWith(
        "/sign-in?redirect_url=%2Forganizations%2Forg-123",
      );
    });

    it("handles network failure gracefully", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === "/api/public/organizations/org-123/services") {
          return jsonResponse(mockCatalogData);
        }
        if (url === "/api/appointments" && init?.method === "POST") {
          throw new Error("Network error");
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      const bookBtn = screen.getByRole("button", {
        name: "Book appointment for General Consultation",
      });
      fireEvent.click(bookBtn);

      const input = screen.getByLabelText(/appointment date and time/i);
      const future = new Date(Date.now() + 3 * 86_400_000);
      const local = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}T11:00`;
      fireEvent.change(input, { target: { value: local } });

      const confirmBtn = screen.getByRole("button", {
        name: /confirm booking/i,
      });
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Unable to connect to the server.");
    });

    it("synchronous duplicate submission guard: prevents second booking request while one is in-flight", async () => {
      let postCallCount = 0;
      const deferredPost = createDeferred<Response>();

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === "/api/public/organizations/org-123/services") {
          return jsonResponse(mockCatalogData);
        }
        if (url === "/api/appointments" && init?.method === "POST") {
          postCallCount++;
          return deferredPost.promise;
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      const bookBtn = screen.getByRole("button", {
        name: "Book appointment for General Consultation",
      });
      fireEvent.click(bookBtn);

      const input = screen.getByLabelText(/appointment date and time/i);
      const future = new Date(Date.now() + 3 * 86_400_000);
      const local = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}T11:00`;
      fireEvent.change(input, { target: { value: local } });

      const confirmBtn = screen.getByRole("button", {
        name: /confirm booking/i,
      });
      fireEvent.click(confirmBtn);
      fireEvent.click(confirmBtn);

      expect(postCallCount).toBe(1);

      await act(async () => {
        deferredPost.resolve(
          jsonResponse(
            {
              id: "appt-1",
              serviceId: "srv-1",
              scheduledAt: new Date().toISOString(),
            },
            201,
          ),
        );
      });
    });

    it("resets booking dialog and discards in-flight booking when organization changes", async () => {
      const deferredPost = createDeferred<Response>();

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === "/api/public/organizations/org-1/services") {
          return jsonResponse(mockCatalogData);
        }
        if (url === "/api/public/organizations/org-2/services") {
          return jsonResponse({
            organization: {
              id: "org-2",
              name: "Beacon Clinic",
              slug: "beacon",
            },
            services: [],
          });
        }
        if (url === "/api/appointments" && init?.method === "POST") {
          return deferredPost.promise;
        }
        return new Response("Not found", { status: 404 });
      });

      mockParams = { organizationId: "org-1" };
      let rerenderFn!: (ui: React.ReactElement) => void;
      await act(async () => {
        const res = render(
          <OrganizationServicesPage
            params={Promise.resolve({ organizationId: "org-1" })}
          />,
        );
        rerenderFn = res.rerender;
      });

      expect(await screen.findByText("Apex Healthcare")).toBeDefined();

      const bookBtn = screen.getByRole("button", {
        name: "Book appointment for General Consultation",
      });
      fireEvent.click(bookBtn);

      expect(screen.getByRole("dialog")).toBeDefined();

      const input = screen.getByLabelText(/appointment date and time/i);
      const future = new Date(Date.now() + 3 * 86_400_000);
      const local = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}T11:00`;
      fireEvent.change(input, { target: { value: local } });

      // Submit booking for org-1
      const confirmBtn = screen.getByRole("button", {
        name: /confirm booking/i,
      });
      fireEvent.click(confirmBtn);

      // Switch organization to org-2 while booking is in flight
      mockParams = { organizationId: "org-2" };
      await act(async () => {
        rerenderFn(
          <OrganizationServicesPage
            params={Promise.resolve({ organizationId: "org-2" })}
          />,
        );
      });

      expect(await screen.findByText("Beacon Clinic")).toBeDefined();

      // Dialog is closed
      expect(screen.queryByRole("dialog")).toBeNull();

      // Resolve in-flight request
      await act(async () => {
        deferredPost.resolve(
          jsonResponse(
            {
              id: "appt-1",
              serviceId: "srv-1",
              scheduledAt: new Date().toISOString(),
            },
            201,
          ),
        );
      });

      // No stale dialog or error alert appears on org-2
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  describe("G. User-friendly queue availability and admission error messages", () => {
    describe("formatAdmissionErrorMessage unit tests", () => {
      it("formats QUEUE_CAPACITY_REACHED into friendly maximum waiting capacity message", () => {
        const result = formatAdmissionErrorMessage(
          {
            error: "Queue waiting capacity reached",
            code: "QUEUE_CAPACITY_REACHED",
          },
          400,
        );
        expect(result.message).toBe(
          "This queue has reached its maximum waiting capacity. Please try again later.",
        );
        expect(result.code).toBe("QUEUE_CAPACITY_REACHED");
      });

      it("formats DAILY_TICKET_LIMIT_REACHED into friendly daily limit message", () => {
        const result = formatAdmissionErrorMessage(
          {
            error: "Daily ticket limit reached",
            code: "DAILY_TICKET_LIMIT_REACHED",
          },
          400,
        );
        expect(result.message).toBe(
          "This queue has reached its daily ticket limit for today. Please try again tomorrow.",
        );
        expect(result.code).toBe("DAILY_TICKET_LIMIT_REACHED");
      });

      it("prioritizes detailed message for ADMISSION_CUTOFF_REACHED", () => {
        const result = formatAdmissionErrorMessage(
          {
            error: "Admission cutoff reached for this service",
            code: "ADMISSION_CUTOFF_REACHED",
            message:
              "Admission cutoff reached for this service (closed at 16:30, 30 minutes prior to closing time 17:00)",
          },
          400,
        );
        expect(result.message).toBe(
          "Admission cutoff reached for this service (closed at 16:30, 30 minutes prior to closing time 17:00)",
        );
        expect(result.code).toBe("ADMISSION_CUTOFF_REACHED");
      });

      it("formats ORGANIZATION_CLOSED with specific closure message", () => {
        const result = formatAdmissionErrorMessage(
          {
            error: "Organization is closed: National Holiday",
            code: "ORGANIZATION_CLOSED",
            message: "Organization is closed: National Holiday",
          },
          400,
        );
        expect(result.message).toBe("Organization is closed: National Holiday");
        expect(result.code).toBe("ORGANIZATION_CLOSED");
      });

      it("formats OUTSIDE_WORKING_HOURS message", () => {
        const result = formatAdmissionErrorMessage(
          {
            error: "Current time is outside organization working hours",
            code: "OUTSIDE_WORKING_HOURS",
            message: "Current time is outside organization working hours",
          },
          400,
        );
        expect(result.message).toBe(
          "Current time is outside organization working hours",
        );
        expect(result.code).toBe("OUTSIDE_WORKING_HOURS");
      });

      it("formats INVALID_SCHEDULE_CONFIGURATION into user-friendly message", () => {
        const result = formatAdmissionErrorMessage(
          {
            error: "Organization schedule is temporarily misconfigured",
            code: "INVALID_SCHEDULE_CONFIGURATION",
          },
          400,
        );
        expect(result.message).toBe(
          "Organization schedule is temporarily misconfigured. Please try again later.",
        );
        expect(result.code).toBe("INVALID_SCHEDULE_CONFIGURATION");
      });

      it("formats 409 conflict into ACTIVE_TICKET_EXISTS with custom or fallback message", () => {
        const fallbackResult = formatAdmissionErrorMessage(null, 409);
        expect(fallbackResult.message).toBe(
          "You already have an active ticket in this queue.",
        );
        expect(fallbackResult.code).toBe("ACTIVE_TICKET_EXISTS");

        const customResult = formatAdmissionErrorMessage(
          { error: "You already have an active ticket in this queue" },
          409,
        );
        expect(customResult.message).toBe(
          "You already have an active ticket in this queue",
        );
        expect(customResult.code).toBe("ACTIVE_TICKET_EXISTS");
      });
    });

    describe("UI integration tests for admission errors and queue availability", () => {
      it("displays friendly waiting capacity message when queue is full", async () => {
        fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
          if (url.includes("/services")) return jsonResponse(mockCatalogData);
          if (url === "/api/tickets" && init?.method === "POST") {
            return jsonResponse(
              {
                error: "Queue waiting capacity reached",
                code: "QUEUE_CAPACITY_REACHED",
              },
              400,
            );
          }
          return new Response("Not found", { status: 404 });
        });

        await renderPage();

        const joinBtn = screen.getByRole("button", {
          name: "Join Standard Line",
        });
        fireEvent.click(joinBtn);

        expect(
          await screen.findByText(
            "This queue has reached its maximum waiting capacity. Please try again later.",
          ),
        ).toBeDefined();
      });

      it("displays friendly daily limit message when daily quota is reached", async () => {
        fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
          if (url.includes("/services")) return jsonResponse(mockCatalogData);
          if (url === "/api/tickets" && init?.method === "POST") {
            return jsonResponse(
              {
                error: "Daily ticket limit reached",
                code: "DAILY_TICKET_LIMIT_REACHED",
              },
              400,
            );
          }
          return new Response("Not found", { status: 404 });
        });

        await renderPage();

        const joinBtn = screen.getByRole("button", {
          name: "Join Standard Line",
        });
        fireEvent.click(joinBtn);

        expect(
          await screen.findByText(
            "This queue has reached its daily ticket limit for today. Please try again tomorrow.",
          ),
        ).toBeDefined();
      });

      it("displays detailed cutoff message when admission cutoff is reached", async () => {
        const detailedCutoff =
          "Admission cutoff reached for this service (closed at 16:30, 30 minutes prior to closing time 17:00)";
        fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
          if (url.includes("/services")) return jsonResponse(mockCatalogData);
          if (url === "/api/tickets" && init?.method === "POST") {
            return jsonResponse(
              {
                error: "Admission cutoff reached for this service",
                code: "ADMISSION_CUTOFF_REACHED",
                reason: "ADMISSION_CUTOFF_REACHED",
                message: detailedCutoff,
              },
              400,
            );
          }
          return new Response("Not found", { status: 404 });
        });

        await renderPage();

        const joinBtn = screen.getByRole("button", {
          name: "Join Standard Line",
        });
        fireEvent.click(joinBtn);

        expect(await screen.findByText(detailedCutoff)).toBeDefined();
      });

      it("displays scheduled closure message when organization is closed", async () => {
        const closureMessage =
          "Organization is closed for scheduled closure (2026-10-24 to 2026-10-25)";
        fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
          if (url.includes("/services")) return jsonResponse(mockCatalogData);
          if (url === "/api/tickets" && init?.method === "POST") {
            return jsonResponse(
              {
                error: closureMessage,
                code: "ORGANIZATION_CLOSED",
                reason: "ORGANIZATION_CLOSED",
                message: closureMessage,
              },
              400,
            );
          }
          return new Response("Not found", { status: 404 });
        });

        await renderPage();

        const joinBtn = screen.getByRole("button", {
          name: "Join Standard Line",
        });
        fireEvent.click(joinBtn);

        expect(await screen.findByText(closureMessage)).toBeDefined();
      });

      it("displays active ticket message and link to /tickets on 409 conflict", async () => {
        fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
          if (url.includes("/services")) return jsonResponse(mockCatalogData);
          if (url === "/api/tickets" && init?.method === "POST") {
            return jsonResponse(
              { error: "You already have an active ticket in this queue" },
              409,
            );
          }
          return new Response("Not found", { status: 404 });
        });

        await renderPage();

        const joinBtn = screen.getByRole("button", {
          name: "Join Standard Line",
        });
        fireEvent.click(joinBtn);

        expect(
          await screen.findByText(
            "You already have an active ticket in this queue",
          ),
        ).toBeDefined();

        const trackLink = screen.getByRole("link", {
          name: /track your ticket in my tickets/i,
        });
        expect(trackLink).toBeDefined();
        expect(trackLink.getAttribute("href")).toBe("/tickets");
      });
    });
  });

  describe("F. Customer-facing queue availability UI", () => {
    const singleQueueCatalog = {
      organization: mockOrg,
      services: [
        {
          id: "srv-1",
          name: "General Consultation",
          description: "Walk-in consultations",
          queues: [{ id: "q-1", name: "Standard Line", isActive: true }],
        },
      ],
    };

    function baseAvailability(overrides: Record<string, unknown> = {}) {
      return {
        id: "q-1",
        name: "Standard Line",
        isActive: true,
        currentlyServing: 8,
        waitingCount: 3,
        estimatedWaitMinutes: 12,
        maxWaitingTickets: 10,
        maxDailyTickets: 100,
        dailyCount: 15,
        isWaitingCapacityFull: false,
        isDailyQuotaReached: false,
        isJoinable: true,
        unavailabilityReason: null,
        unavailabilityCode: null,
        organizationStatus: {
          isOpen: true,
          reason: "OPEN",
          message: null,
        },
        admissionStatus: {
          isAdmitted: true,
          reason: "ADMITTED",
          message: "Admission is open",
          cutoffMinutes: 15,
          effectiveCutoffTime: "16:45",
        },
        ...overrides,
      };
    }

    it("displays Open status badge in header when organization is open", async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes("/services")) {
          return jsonResponse(singleQueueCatalog);
        }
        if (url.includes("/api/queues/q-1")) {
          return jsonResponse(baseAvailability());
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      const badge = await screen.findByTestId("org-status-badge");
      expect(badge).toBeDefined();
      expect(badge.textContent).toContain("Open");
    });

    it("displays Closed badge in header, banner, and disables joining when organization is closed", async () => {
      const closedReason = "This organization is currently closed for the holiday.";
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes("/services")) {
          return jsonResponse(singleQueueCatalog);
        }
        if (url.includes("/api/queues/q-1")) {
          return jsonResponse(
            baseAvailability({
              isJoinable: false,
              organizationStatus: {
                isOpen: false,
                reason: "ORGANIZATION_CLOSED",
                message: closedReason,
              },
              unavailabilityReason: closedReason,
              unavailabilityCode: "ORGANIZATION_CLOSED",
            }),
          );
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      const badge = await screen.findByTestId("org-status-badge");
      expect(badge.textContent).toContain("Closed");

      // Closure message in banner
      expect(await screen.findAllByText(closedReason)).toHaveLength(2); // One in header, one on queue card

      // Join button disabled
      const joinBtn = screen.getByRole("button", {
        name: /join standard line \(currently unavailable/i,
      });
      expect(joinBtn).toBeDefined();
      expect(joinBtn.hasAttribute("disabled")).toBe(true);
      expect(joinBtn.getAttribute("aria-disabled")).toBe("true");
      expect(joinBtn.textContent).toBe("Queue Unavailable");
    });

    it("displays Available badge, live stats, and enabled Join Queue button when queue is available", async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes("/services")) {
          return jsonResponse(singleQueueCatalog);
        }
        if (url.includes("/api/queues/q-1")) {
          return jsonResponse(
            baseAvailability({
              waitingCount: 4,
              maxWaitingTickets: 12,
              estimatedWaitMinutes: 18,
              currentlyServing: 15,
            }),
          );
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      expect(await screen.findByText("Available")).toBeDefined();
      expect(await screen.findByText(/Waiting: 4 \/ 12/)).toBeDefined();
      expect(await screen.findByText(/Est\. wait: ~18 min/)).toBeDefined();
      expect(await screen.findByText("#15")).toBeDefined();

      const joinBtn = screen.getByRole("button", { name: "Join Standard Line" });
      expect(joinBtn.hasAttribute("disabled")).toBe(false);
    });

    it("displays Queue Full badge, friendly alert, and disables Join Queue when waiting capacity is reached", async () => {
      const fullReason =
        "This queue has reached its maximum waiting capacity. Please try again later.";
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes("/services")) {
          return jsonResponse(singleQueueCatalog);
        }
        if (url.includes("/api/queues/q-1")) {
          return jsonResponse(
            baseAvailability({
              isJoinable: false,
              isWaitingCapacityFull: true,
              waitingCount: 10,
              maxWaitingTickets: 10,
              unavailabilityReason: fullReason,
              unavailabilityCode: "QUEUE_CAPACITY_REACHED",
            }),
          );
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      expect(await screen.findByText("Queue Full")).toBeDefined();
      expect(await screen.findByText(/Waiting: 10 \/ 10/)).toBeDefined();

      const banner = await screen.findByTestId("queue-unavailable-banner-q-1");
      expect(banner.textContent).toContain(fullReason);

      const joinBtn = screen.getByRole("button", {
        name: /join standard line \(currently unavailable: this queue has reached its maximum waiting capacity/i,
      });
      expect(joinBtn).toBeDefined();
      expect(joinBtn.hasAttribute("disabled")).toBe(true);
      expect(joinBtn.textContent).toBe("Queue Unavailable");
    });

    it("displays waiting count without max capacity when maxWaitingTickets is null", async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes("/services")) {
          return jsonResponse(singleQueueCatalog);
        }
        if (url.includes("/api/queues/q-1")) {
          return jsonResponse(
            baseAvailability({
              waitingCount: 7,
              maxWaitingTickets: null,
              estimatedWaitMinutes: 20,
            }),
          );
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      expect(await screen.findByText(/Waiting:\s*7/)).toBeDefined();
    });

    it("displays 'No wait' when queue is empty and estimatedWaitMinutes is null", async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes("/services")) {
          return jsonResponse(singleQueueCatalog);
        }
        if (url.includes("/api/queues/q-1")) {
          return jsonResponse(
            baseAvailability({
              waitingCount: 0,
              estimatedWaitMinutes: null,
            }),
          );
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      expect(await screen.findByText(/Waiting:\s*0/)).toBeDefined();
      expect(await screen.findByText("No wait")).toBeDefined();
    });

    it("omits wait estimate without fabricating numbers when queue has waiting tickets but no estimate", async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes("/services")) {
          return jsonResponse(singleQueueCatalog);
        }
        if (url.includes("/api/queues/q-1")) {
          return jsonResponse(
            baseAvailability({
              waitingCount: 5,
              estimatedWaitMinutes: null,
            }),
          );
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      expect(await screen.findByText(/Waiting: 5/)).toBeDefined();
      expect(screen.queryByText(/Est\. wait:/)).toBeNull();
      expect(screen.queryByText("No wait")).toBeNull();
    });

    it("displays Daily Quota Reached badge, notice, and disables join button when daily limit is reached", async () => {
      const quotaReason =
        "This queue has reached its daily ticket limit for today. Please try again tomorrow.";
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes("/services")) {
          return jsonResponse(singleQueueCatalog);
        }
        if (url.includes("/api/queues/q-1")) {
          return jsonResponse(
            baseAvailability({
              isJoinable: false,
              isDailyQuotaReached: true,
              dailyCount: 50,
              maxDailyTickets: 50,
              unavailabilityReason: quotaReason,
              unavailabilityCode: "DAILY_TICKET_LIMIT_REACHED",
            }),
          );
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      expect(await screen.findByText("Daily Quota Reached")).toBeDefined();
      expect(await screen.findByText("Daily: 50 / 50")).toBeDefined();

      const banner = await screen.findByTestId("queue-unavailable-banner-q-1");
      expect(banner.textContent).toContain(quotaReason);

      const joinBtn = screen.getByRole("button", {
        name: /join standard line \(currently unavailable: this queue has reached its daily ticket limit/i,
      });
      expect(joinBtn.hasAttribute("disabled")).toBe(true);
      expect(joinBtn.textContent).toBe("Queue Unavailable");
    });

    it("displays Admission Closed badge and cutoff notice when cutoff time has passed", async () => {
      const cutoffReason =
        "Admission cutoff reached for this service. No more tickets are being admitted today.";
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes("/services")) {
          return jsonResponse(singleQueueCatalog);
        }
        if (url.includes("/api/queues/q-1")) {
          return jsonResponse(
            baseAvailability({
              isJoinable: false,
              admissionStatus: {
                isAdmitted: false,
                reason: "ADMISSION_CUTOFF_REACHED",
                message: cutoffReason,
                cutoffMinutes: 30,
                effectiveCutoffTime: "16:30",
              },
              unavailabilityReason: cutoffReason,
              unavailabilityCode: "ADMISSION_CUTOFF_REACHED",
            }),
          );
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      expect(await screen.findByText("Admission Closed")).toBeDefined();
      expect(
        await screen.findByText(/Admission closed for today at 16:30/),
      ).toBeDefined();

      const banner = await screen.findByTestId("queue-unavailable-banner-q-1");
      expect(banner.textContent).toContain(cutoffReason);

      const joinBtn = screen.getByRole("button", {
        name: /join standard line \(currently unavailable: admission cutoff reached/i,
      });
      expect(joinBtn.hasAttribute("disabled")).toBe(true);
      expect(joinBtn.textContent).toBe("Queue Unavailable");
    });

    it("shows loading state while queue availability is being fetched and updates once resolved", async () => {
      const deferred = createDeferred<Response>();
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes("/services")) {
          return jsonResponse(singleQueueCatalog);
        }
        if (url.includes("/api/queues/q-1")) {
          return deferred.promise;
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      expect(screen.getByText("Checking...")).toBeDefined();

      // Resolve availability
      await act(async () => {
        deferred.resolve(jsonResponse(baseAvailability()));
      });

      expect(await screen.findByText("Available")).toBeDefined();
      expect(await screen.findByText(/Waiting: 3 \/ 10/)).toBeDefined();
    });

    it("shows error fallback with retry button when availability API fails", async () => {
      let attempt = 0;
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes("/services")) {
          return jsonResponse(singleQueueCatalog);
        }
        if (url.includes("/api/queues/q-1")) {
          attempt++;
          if (attempt === 1) {
            return new Response("Internal Server Error", { status: 500 });
          }
          return jsonResponse(baseAvailability());
        }
        return new Response("Not found", { status: 404 });
      });

      await renderPage();

      expect(
        await screen.findByText("Availability information unavailable"),
      ).toBeDefined();

      const retryBtn = screen.getByRole("button", { name: "Retry" });
      expect(retryBtn).toBeDefined();

      // Click retry
      fireEvent.click(retryBtn);

      expect(await screen.findByText("Available")).toBeDefined();
      expect(await screen.findByText(/Waiting: 3 \/ 10/)).toBeDefined();
    });
  });
});
