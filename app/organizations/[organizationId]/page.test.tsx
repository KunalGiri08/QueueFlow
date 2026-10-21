// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import OrganizationServicesPage from "./page";

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
      // Fetch only called once for initial GET catalog
      expect(fetchMock).toHaveBeenCalledTimes(1);
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
});
