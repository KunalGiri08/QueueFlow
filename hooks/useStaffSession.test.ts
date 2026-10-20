// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useStaffSession } from "./useStaffSession";

// 1. Mock Next.js navigation with a stable router object identity
const mockPush = vi.fn();
const mockRouter = {
  push: mockPush,
};
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

// 2. Mock Clerk auth state
let mockAuthState = {
  isSignedIn: true,
  isLoaded: true,
};

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => mockAuthState,
}));

// Test data
const mockUser = {
  id: "user-staff-1",
  name: "Jane Operator",
  email: "jane@queueflow.com",
};

const mockOrg1 = {
  id: "org-1",
  name: "Apex Healthcare",
  slug: "apex",
};

const mockOrg2 = {
  id: "org-2",
  name: "Beacon Clinic",
  slug: "beacon",
};

const mockOrg3 = {
  id: "org-3",
  name: "Crestview Health",
  slug: "crestview",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("hooks/useStaffSession", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let activeFetchHandler: (
    url: string,
    init?: RequestInit,
  ) => Promise<Response> | Response;

  function defaultFetchHandler(url: string): Response {
    if (url === "/api/auth/me") {
      return jsonResponse(mockUser);
    }
    if (url === "/api/organizations") {
      return jsonResponse([mockOrg1, mockOrg2]);
    }
    return jsonResponse({ error: "Not found" }, 404);
  }

  beforeEach(() => {
    mockAuthState = {
      isSignedIn: true,
      isLoaded: true,
    };
    mockPush.mockReset();
    activeFetchHandler = (url) => defaultFetchHandler(url);
    fetchMock = vi
      .fn()
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        return activeFetchHandler(url, init);
      });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("1. Clerk Authentication & Redirects", () => {
    it("waits while Clerk is loading without redirecting or fetching", () => {
      mockAuthState = {
        isLoaded: false,
        isSignedIn: false,
      };

      const { result } = renderHook(() => useStaffSession());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.user).toBeNull();
      expect(mockPush).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("redirects to sign-in when Clerk reports the user is unauthenticated", () => {
      mockAuthState = {
        isLoaded: true,
        isSignedIn: false,
      };

      const { result } = renderHook(() => useStaffSession());

      expect(mockPush).toHaveBeenCalledWith("/sign-in?redirect_url=%2Fstaff");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(true);
    });

    it("respects custom signInRedirectUrl option", () => {
      mockAuthState = {
        isLoaded: true,
        isSignedIn: false,
      };

      renderHook(() =>
        useStaffSession({ signInRedirectUrl: "/custom-sign-in" }),
      );

      expect(mockPush).toHaveBeenCalledWith("/custom-sign-in");
    });

    it("redirects to sign-in if /api/auth/me returns 401", async () => {
      activeFetchHandler = (url) => {
        if (url === "/api/auth/me") {
          return jsonResponse({ error: "Unauthorized" }, 401);
        }
        return defaultFetchHandler(url);
      };

      renderHook(() => useStaffSession());

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/sign-in?redirect_url=%2Fstaff");
      });
    });

    it("redirects to sign-in if /api/organizations returns 401", async () => {
      activeFetchHandler = (url) => {
        if (url === "/api/organizations") {
          return jsonResponse({ error: "Unauthorized" }, 401);
        }
        return defaultFetchHandler(url);
      };

      renderHook(() => useStaffSession());

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/sign-in?redirect_url=%2Fstaff");
      });
    });
  });

  describe("2. Successful Session & Organization Bootstrapping", () => {
    it("loads current user and organizations and defaults to the first organization", async () => {
      const { result } = renderHook(() => useStaffSession());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.organizations).toEqual([mockOrg1, mockOrg2]);
      expect(result.current.selectedOrgId).toBe("org-1");
      expect(result.current.selectedOrganization).toEqual(mockOrg1);
      expect(result.current.error).toBeNull();
    });

    it("handles empty organization memberships safely", async () => {
      activeFetchHandler = (url) => {
        if (url === "/api/organizations") {
          return jsonResponse([]);
        }
        return defaultFetchHandler(url);
      };

      const { result } = renderHook(() => useStaffSession());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.organizations).toEqual([]);
      expect(result.current.selectedOrgId).toBeNull();
      expect(result.current.selectedOrganization).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe("3. Organization Selection Preservation & Fallback", () => {
    it("preserves a valid selected organization across session refresh", async () => {
      const { result } = renderHook(() => useStaffSession());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Manually switch to org-2
      act(() => {
        result.current.setSelectedOrgId("org-2");
      });
      expect(result.current.selectedOrgId).toBe("org-2");
      expect(result.current.selectedOrganization).toEqual(mockOrg2);

      // Trigger session refresh while org-2 is still in the list
      await act(async () => {
        await result.current.retrySession();
      });

      expect(result.current.selectedOrgId).toBe("org-2");
      expect(result.current.selectedOrganization).toEqual(mockOrg2);
    });

    it("falls back to the first organization if the selected organization disappears on refresh", async () => {
      let currentOrgs = [mockOrg1, mockOrg2];
      activeFetchHandler = (url) => {
        if (url === "/api/organizations") {
          return jsonResponse(currentOrgs);
        }
        return defaultFetchHandler(url);
      };

      const { result } = renderHook(() => useStaffSession());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setSelectedOrgId("org-2");
      });
      expect(result.current.selectedOrgId).toBe("org-2");

      // Update backend to no longer return org-2 (e.g. removed from org-2)
      currentOrgs = [mockOrg1, mockOrg3];

      await act(async () => {
        await result.current.retrySession();
      });

      // Must fall back to first organization (org-1)
      expect(result.current.selectedOrgId).toBe("org-1");
      expect(result.current.selectedOrganization).toEqual(mockOrg1);
    });

    it("sets selected organization to null if all organizations disappear on refresh", async () => {
      let currentOrgs = [mockOrg1];
      activeFetchHandler = (url) => {
        if (url === "/api/organizations") {
          return jsonResponse(currentOrgs);
        }
        return defaultFetchHandler(url);
      };

      const { result } = renderHook(() => useStaffSession());

      await waitFor(() => {
        expect(result.current.selectedOrgId).toBe("org-1");
      });

      currentOrgs = [];

      await act(async () => {
        await result.current.retrySession();
      });

      expect(result.current.selectedOrgId).toBeNull();
      expect(result.current.selectedOrganization).toBeNull();
      expect(result.current.organizations).toEqual([]);
    });
  });

  describe("4. Error Handling & Retry Lifecycle", () => {
    it("displays error when /api/auth/me fails with 500, and recovers on retry", async () => {
      let failMe = true;
      activeFetchHandler = (url) => {
        if (url === "/api/auth/me" && failMe) {
          return jsonResponse({ error: "Internal server error" }, 500);
        }
        return defaultFetchHandler(url);
      };

      const { result } = renderHook(() => useStaffSession());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe(
        "Unable to load your operator session at this time. Please try again.",
      );
      expect(result.current.user).toBeNull();

      // Fix endpoint and call retrySession
      failMe = false;
      await act(async () => {
        await result.current.retrySession();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.organizations).toEqual([mockOrg1, mockOrg2]);
      expect(result.current.selectedOrgId).toBe("org-1");
    });

    it("displays error when /api/organizations fails with 500", async () => {
      activeFetchHandler = (url) => {
        if (url === "/api/organizations") {
          return jsonResponse({ error: "Database error" }, 500);
        }
        return defaultFetchHandler(url);
      };

      const { result } = renderHook(() => useStaffSession());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe(
        "Unable to load your operator session at this time. Please try again.",
      );
    });

    it("handles malformed user JSON gracefully", async () => {
      activeFetchHandler = (url) => {
        if (url === "/api/auth/me") {
          return jsonResponse({ name: "No ID field" });
        }
        return defaultFetchHandler(url);
      };

      const { result } = renderHook(() => useStaffSession());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe(
        "Unable to load your operator session at this time. Please try again.",
      );
    });

    it("handles malformed organizations JSON gracefully", async () => {
      activeFetchHandler = (url) => {
        if (url === "/api/organizations") {
          return jsonResponse({ organizations: "not-an-array" });
        }
        return defaultFetchHandler(url);
      };

      const { result } = renderHook(() => useStaffSession());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe(
        "Unable to load your operator session at this time. Please try again.",
      );
    });
  });

  describe("5. AbortController & Stale Response Safety", () => {
    it("aborts in-flight session requests when retrySession is triggered", async () => {
      const capturedSignals: AbortSignal[] = [];

      activeFetchHandler = (url, init) => {
        if (init?.signal) {
          capturedSignals.push(init.signal);
        }
        // Return a promise that never resolves immediately
        return new Promise(() => {});
      };

      const { result } = renderHook(() => useStaffSession());

      expect(capturedSignals.length).toBe(2); // auth/me and organizations
      expect(capturedSignals.every((s) => !s.aborted)).toBe(true);

      // Trigger retry while the first requests are still pending
      act(() => {
        void result.current.retrySession();
      });

      // The initial requests should now be aborted
      expect(capturedSignals[0].aborted).toBe(true);
      expect(capturedSignals[1].aborted).toBe(true);
      // New requests created
      expect(capturedSignals.length).toBe(4);
      expect(capturedSignals[2].aborted).toBe(false);
      expect(capturedSignals[3].aborted).toBe(false);
    });

    it("aborts active requests on unmount", () => {
      const capturedSignals: AbortSignal[] = [];

      activeFetchHandler = (url, init) => {
        if (init?.signal) {
          capturedSignals.push(init.signal);
        }
        return new Promise(() => {});
      };

      const { unmount } = renderHook(() => useStaffSession());

      expect(capturedSignals.length).toBe(2);
      expect(capturedSignals.every((s) => !s.aborted)).toBe(true);

      unmount();

      expect(capturedSignals.every((s) => s.aborted)).toBe(true);
    });

    it("prevents stale responses from overriding newer session state", async () => {
      let resolveFirstMe!: (res: Response) => void;
      let callCount = 0;

      activeFetchHandler = (url) => {
        if (url === "/api/auth/me") {
          callCount++;
          if (callCount === 1) {
            return new Promise((resolve) => {
              resolveFirstMe = resolve;
            });
          }
          // Second call resolves immediately with user 2
          return jsonResponse({
            id: "user-2",
            name: "Updated User",
            email: "updated@queueflow.com",
          });
        }
        return defaultFetchHandler(url);
      };

      const { result } = renderHook(() => useStaffSession());

      // While call 1 is pending, trigger retry (call 2)
      act(() => {
        void result.current.retrySession();
      });

      await waitFor(() => {
        expect(result.current.user?.id).toBe("user-2");
      });

      // Now resolve the older call 1
      act(() => {
        resolveFirstMe(jsonResponse(mockUser));
      });

      // User must stay user-2 and not be overwritten by stale response
      expect(result.current.user?.id).toBe("user-2");
    });
  });

  describe("6. Manual Organization Selection", () => {
    it("updates selectedOrgId and selectedOrganization when setSelectedOrgId is called", async () => {
      const { result } = renderHook(() => useStaffSession());

      await waitFor(() => {
        expect(result.current.selectedOrgId).toBe("org-1");
      });

      act(() => {
        result.current.setSelectedOrgId("org-2");
      });

      expect(result.current.selectedOrgId).toBe("org-2");
      expect(result.current.selectedOrganization).toEqual(mockOrg2);

      act(() => {
        result.current.setSelectedOrgId(null);
      });

      expect(result.current.selectedOrgId).toBeNull();
      expect(result.current.selectedOrganization).toBeNull();
    });
  });
});
