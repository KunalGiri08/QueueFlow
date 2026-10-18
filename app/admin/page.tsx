"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";

interface OrganizationItem {
  id: string;
  name: string;
  slug: string;
}

interface CounterItem {
  id: string;
  name: string;
  organizationId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

type AdminAuthResult = "authorized" | "forbidden" | "error";

function AdminSkeleton() {
  return (
    <div aria-label="Loading admin dashboard" className="space-y-6 animate-pulse">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 rounded bg-gray-200" />
            <div className="h-4 w-72 rounded bg-gray-100" />
          </div>
          <div className="h-10 w-52 rounded-lg bg-gray-200" />
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="h-6 w-44 rounded bg-gray-200 mb-4" />
        <div className="h-24 w-full rounded bg-gray-100" />
      </div>
    </div>
  );
}

function VerifyingSkeleton({ orgName }: { orgName: string }) {
  return (
    <div
      aria-label={`Verifying administrator permissions for ${orgName}`}
      className="space-y-6 animate-pulse"
    >
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 rounded-full bg-blue-200" />
          <div className="h-5 w-64 rounded bg-gray-200" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-3"
          >
            <div className="h-5 w-32 rounded bg-gray-200" />
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-3/4 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CountersSkeleton() {
  return (
    <div
      aria-label="Loading service counters"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pulse"
    >
      {Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="h-5 w-28 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded-full bg-gray-200" />
          </div>
          <div className="h-3 w-36 rounded bg-gray-100" />
          <div className="h-3 w-24 rounded bg-gray-100 pt-2" />
        </div>
      ))}
    </div>
  );
}

function formatCounterDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "Created recently";
  }
  return `Created ${date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })}`;
}

export default function OrganizationAdminPage() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();

  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Track the organization ID for which verification has completed
  const [verifiedOrgId, setVerifiedOrgId] = useState<string | null>(null);
  const [adminAuthResult, setAdminAuthResult] = useState<AdminAuthResult | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [verifyRetryTrigger, setVerifyRetryTrigger] = useState(0);

  // Counter management states
  const [counters, setCounters] = useState<CounterItem[]>([]);
  const [countersOrgId, setCountersOrgId] = useState<string | null>(null);
  const [countersError, setCountersError] = useState<string | null>(null);
  const [countersRetryTrigger, setCountersRetryTrigger] = useState(0);

  // Counter creation form states
  const [newCounterName, setNewCounterName] = useState("");
  const [isCreatingCounter, setIsCreatingCounter] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Stale request prevention refs
  const activeVerifyControllerRef = useRef<AbortController | null>(null);
  const activeCounterControllerRef = useRef<AbortController | null>(null);
  const selectedOrgIdRef = useRef<string | null>(selectedOrgId);
  const counterFetchGenerationRef = useRef<number>(0);
  const activeCreationRequestIdRef = useRef<number>(0);

  useEffect(() => {
    selectedOrgIdRef.current = selectedOrgId;
  }, [selectedOrgId]);

  const fetchOrganizations = useCallback(async () => {
    setIsSessionLoading(true);
    setSessionError(null);

    try {
      const response = await fetch("/api/organizations");

      if (response.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to load organizations (status ${response.status})`);
      }

      const orgsJson: unknown = await response.json();

      if (!Array.isArray(orgsJson)) {
        throw new Error("Malformed organizations response");
      }

      const validatedOrgs: OrganizationItem[] = orgsJson.filter(
        (org): org is OrganizationItem =>
          typeof org === "object" &&
          org !== null &&
          typeof (org as { id?: unknown }).id === "string" &&
          typeof (org as { name?: unknown }).name === "string" &&
          typeof (org as { slug?: unknown }).slug === "string",
      );

      setOrganizations(validatedOrgs);

      setSelectedOrgId((currentSelected) => {
        if (
          currentSelected &&
          validatedOrgs.some((org) => org.id === currentSelected)
        ) {
          return currentSelected;
        }
        return validatedOrgs.length > 0 ? validatedOrgs[0].id : null;
      });
    } catch {
      setSessionError(
        "Unable to load your organizations at this time. Please try again.",
      );
    } finally {
      setIsSessionLoading(false);
    }
  }, [router]);

  // Auth gate effect: handle Clerk initialization and sign-out redirect
  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
      return;
    }

    let isCurrent = true;

    fetch("/api/organizations")
      .then(async (response) => {
        if (!isCurrent) return;

        if (response.status === 401) {
          router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to load organizations (status ${response.status})`);
        }

        const orgsJson: unknown = await response.json();
        if (!Array.isArray(orgsJson)) {
          throw new Error("Malformed organizations response");
        }

        const validatedOrgs: OrganizationItem[] = orgsJson.filter(
          (org): org is OrganizationItem =>
            typeof org === "object" &&
            org !== null &&
            typeof (org as { id?: unknown }).id === "string" &&
            typeof (org as { name?: unknown }).name === "string" &&
            typeof (org as { slug?: unknown }).slug === "string",
        );

        setOrganizations(validatedOrgs);
        setSelectedOrgId((currentSelected) => {
          if (
            currentSelected &&
            validatedOrgs.some((org) => org.id === currentSelected)
          ) {
            return currentSelected;
          }
          return validatedOrgs.length > 0 ? validatedOrgs[0].id : null;
        });
      })
      .catch(() => {
        if (!isCurrent) return;
        setSessionError(
          "Unable to load your organizations at this time. Please try again.",
        );
      })
      .finally(() => {
        if (isCurrent) {
          setIsSessionLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [isLoaded, isSignedIn, router]);

  // Verification effect: triggers whenever selected organization changes or retry is triggered
  useEffect(() => {
    if (!selectedOrgId) return;

    if (activeVerifyControllerRef.current) {
      activeVerifyControllerRef.current.abort();
    }

    let isCurrent = true;
    const controller = new AbortController();
    activeVerifyControllerRef.current = controller;

    fetch(`/api/staff?organizationId=${encodeURIComponent(selectedOrgId)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!isCurrent) return;

        if (res.status === 401) {
          router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
          return;
        }

        if (res.status === 200) {
          setVerifiedOrgId(selectedOrgId);
          setAdminAuthResult("authorized");
          setAdminError(null);
          return;
        }

        if (res.status === 403) {
          setVerifiedOrgId(selectedOrgId);
          setAdminAuthResult("forbidden");
          setAdminError(null);
          return;
        }

        throw new Error(`Unexpected server response (status ${res.status})`);
      })
      .catch((err: unknown) => {
        if (!isCurrent) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setVerifiedOrgId(selectedOrgId);
        setAdminAuthResult("error");
        setAdminError(
          "Unable to verify administrator permissions for this organization. Please try again.",
        );
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [selectedOrgId, verifyRetryTrigger, router]);

  // Counter fetching effect: triggers when organization is verified as ADMIN
  useEffect(() => {
    // If not selected or not yet verified as ADMIN for this selected organization, abort any pending fetch
    if (!selectedOrgId || adminAuthResult !== "authorized" || verifiedOrgId !== selectedOrgId) {
      if (activeCounterControllerRef.current) {
        activeCounterControllerRef.current.abort();
        activeCounterControllerRef.current = null;
      }
      return;
    }

    if (activeCounterControllerRef.current) {
      activeCounterControllerRef.current.abort();
    }

    let isCurrent = true;
    const fetchGen = ++counterFetchGenerationRef.current;
    const controller = new AbortController();
    activeCounterControllerRef.current = controller;

    fetch(`/api/organizations/${encodeURIComponent(selectedOrgId)}/counters`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!isCurrent || counterFetchGenerationRef.current !== fetchGen) return;

        if (res.status === 401) {
          router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
          return;
        }

        if (!res.ok) {
          throw new Error(`Failed to load counters (status ${res.status})`);
        }

        const data: unknown = await res.json();
        if (!Array.isArray(data)) {
          throw new Error("Malformed counters response");
        }

        const validated: CounterItem[] = data.filter(
          (c): c is CounterItem =>
            typeof c === "object" &&
            c !== null &&
            typeof (c as { id?: unknown }).id === "string" &&
            typeof (c as { name?: unknown }).name === "string" &&
            typeof (c as { organizationId?: unknown }).organizationId === "string" &&
            typeof (c as { isActive?: unknown }).isActive === "boolean" &&
            typeof (c as { createdAt?: unknown }).createdAt === "string",
        );

        validated.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true }),
        );

        if (!isCurrent || counterFetchGenerationRef.current !== fetchGen) return;

        setCounters(validated);
        setCountersOrgId(selectedOrgId);
        setCountersError(null);
      })
      .catch((err: unknown) => {
        if (!isCurrent || counterFetchGenerationRef.current !== fetchGen) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setCountersOrgId(selectedOrgId);
        setCountersError(
          "Unable to load service counters at this time. Please try again.",
        );
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [selectedOrgId, verifiedOrgId, adminAuthResult, countersRetryTrigger, router]);

  const handleRetryVerification = () => {
    if (!selectedOrgId) return;
    setVerifiedOrgId(null);
    setVerifyRetryTrigger((prev) => prev + 1);
  };

  const handleRetryCounters = () => {
    if (!selectedOrgId) return;
    setCountersOrgId(null);
    setCountersError(null);
    setCountersRetryTrigger((prev) => prev + 1);
  };

  const handleCreateCounter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || isCreatingCounter) return;

    const trimmed = newCounterName.trim();
    if (!trimmed) {
      setFormError("Counter name is required.");
      return;
    }

    const creationRequestId = ++activeCreationRequestIdRef.current;
    setIsCreatingCounter(true);
    setFormError(null);
    setFormSuccess(null);

    const targetOrgId = selectedOrgId;

    try {
      const res = await fetch(
        `/api/organizations/${encodeURIComponent(targetOrgId)}/counters`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: trimmed }),
        },
      );

      // Verify the user is still on the same organization and this is still the active request
      if (
        selectedOrgIdRef.current !== targetOrgId ||
        activeCreationRequestIdRef.current !== creationRequestId
      ) {
        return;
      }

      if (res.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
        return;
      }

      if (res.status === 409) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setFormError(
          data.error || "A counter with this name already exists in this organization.",
        );
        return;
      }

      if (res.status === 400) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          details?: { fieldErrors?: { name?: string[] } };
        };
        const message =
          data.details?.fieldErrors?.name?.[0] || data.error || "Invalid counter name.";
        setFormError(message);
        return;
      }

      if (res.status === 403) {
        setFormError("Only organization admins can create counters.");
        return;
      }

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const newCounter: unknown = await res.json();

      // Check again after parsing JSON in case of race
      if (
        selectedOrgIdRef.current !== targetOrgId ||
        activeCreationRequestIdRef.current !== creationRequestId
      ) {
        return;
      }

      // Cancel any in-flight GET requests and bump fetch generation so older GET responses cannot overwrite this creation
      counterFetchGenerationRef.current += 1;
      if (activeCounterControllerRef.current) {
        activeCounterControllerRef.current.abort();
        activeCounterControllerRef.current = null;
      }

      if (
        typeof newCounter === "object" &&
        newCounter !== null &&
        typeof (newCounter as { id?: unknown }).id === "string" &&
        typeof (newCounter as { name?: unknown }).name === "string" &&
        typeof (newCounter as { organizationId?: unknown }).organizationId === "string" &&
        typeof (newCounter as { isActive?: unknown }).isActive === "boolean" &&
        typeof (newCounter as { createdAt?: unknown }).createdAt === "string"
      ) {
        const validCounter = newCounter as CounterItem;
        setCounters((prev) => {
          const updated = [...prev, validCounter];
          updated.sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true }),
          );
          return updated;
        });
        setNewCounterName("");
        setFormSuccess(`Counter "${validCounter.name}" created successfully.`);
      } else {
        handleRetryCounters();
        setNewCounterName("");
        setFormSuccess(`Counter "${trimmed}" created successfully.`);
      }
    } catch {
      if (
        selectedOrgIdRef.current === targetOrgId &&
        activeCreationRequestIdRef.current === creationRequestId
      ) {
        setFormError(
          "Failed to create counter due to a network error. Please try again.",
        );
      }
    } finally {
      if (activeCreationRequestIdRef.current === creationRequestId) {
        setIsCreatingCounter(false);
      }
    }
  };

  const selectedOrg = organizations.find((org) => org.id === selectedOrgId) ?? null;
  const isVerifying = Boolean(selectedOrgId && verifiedOrgId !== selectedOrgId);
  const isCountersLoading = Boolean(
    adminAuthResult === "authorized" &&
      verifiedOrgId === selectedOrgId &&
      countersOrgId !== selectedOrgId,
  );
  const displayedCounters = countersOrgId === selectedOrgId ? counters : [];

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50/50 py-8 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                Organization Administration
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                Manage counters, services, queues, and staff members for your organization.
              </p>
            </div>
            {selectedOrg && !isVerifying && adminAuthResult === "authorized" && (
              <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200/80">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Admin Access Verified
              </span>
            )}
          </div>

          {/* Initial Auth / Session Loading State */}
          {!isLoaded || isSessionLoading ? (
            <AdminSkeleton />
          ) : sessionError ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50/70 p-6 text-center text-red-800 shadow-sm"
            >
              <p className="text-base font-medium">{sessionError}</p>
              <button
                type="button"
                onClick={() => fetchOrganizations()}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                Retry
              </button>
            </div>
          ) : organizations.length === 0 ? (
            /* Empty State: user belongs to no organizations */
            <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z"
                  />
                </svg>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-gray-900">
                No Organizations Found
              </h2>
              <p className="mt-2 text-sm text-gray-600 max-w-md mx-auto">
                You are not currently a member of any organization on QueueFlow. Ask an organization administrator to invite you, or browse public organizations.
              </p>
              <div className="mt-6">
                <Link
                  href="/organizations"
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
                >
                  Explore Public Organizations
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Organization Selector Card */}
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <label
                      htmlFor="admin-org-select"
                      className="block text-sm font-semibold text-gray-900"
                    >
                      Active Organization
                    </label>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Select an organization to verify your administrator access and view settings.
                    </p>
                  </div>
                  <div className="sm:w-72">
                    <select
                      id="admin-org-select"
                      aria-label="Active Organization"
                      value={selectedOrgId ?? ""}
                      onChange={(e) => {
                        const newId = e.target.value;
                        setSelectedOrgId(newId);
                        activeCreationRequestIdRef.current += 1;
                        setIsCreatingCounter(false);
                        setNewCounterName("");
                        setFormError(null);
                        setFormSuccess(null);
                      }}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    >
                      {organizations.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name} (@{org.slug})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Dynamic State Rendering Based on Admin Authorization */}
              {isVerifying && selectedOrg && (
                <VerifyingSkeleton orgName={selectedOrg.name} />
              )}

              {!isVerifying && adminAuthResult === "forbidden" && selectedOrg && (
                /* 403 Forbidden State: User is a member, but not ADMIN */
                <div
                  role="alert"
                  className="rounded-xl border border-amber-200 bg-amber-50/70 p-8 text-center shadow-sm"
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <svg
                      className="h-6 w-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                      />
                    </svg>
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-amber-900">
                    Administrator Access Required
                  </h2>
                  <p className="mt-2 text-sm text-amber-800 max-w-lg mx-auto">
                    You have a member account in <span className="font-semibold">{selectedOrg.name}</span>, but your account does not have <span className="font-semibold">ADMIN</span> privileges. Only organization administrators can manage counters, services, queues, and staff members.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    <Link
                      href="/staff"
                      className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 active:scale-[0.98]"
                    >
                      Go to Staff Operator Console
                    </Link>
                  </div>
                </div>
              )}

              {!isVerifying && adminAuthResult === "error" && (
                /* Generic Failure / Network Error */
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50/70 p-6 text-center text-red-800 shadow-sm"
                >
                  <p className="text-base font-medium">{adminError}</p>
                  <button
                    type="button"
                    onClick={handleRetryVerification}
                    className="mt-4 inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
                  >
                    Retry Verification
                  </button>
                </div>
              )}

              {!isVerifying && adminAuthResult === "authorized" && selectedOrg && (
                /* 200 OK: Admin Dashboard Content */
                <div className="space-y-8">
                  {/* Organization Info Banner */}
                  <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">
                          {selectedOrg.name}
                        </h2>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                            @{selectedOrg.slug}
                          </span>
                          <span className="text-xs text-gray-400 font-mono">
                            ID: {selectedOrg.id}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section: Counter Management (Step 2) */}
                  <div className="space-y-6">
                    {/* Counter Section Header & Controls */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200/80 pb-4">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h2 className="text-lg font-bold text-gray-900">
                            Service Counters
                          </h2>
                          {!isCountersLoading &&
                            countersOrgId === selectedOrg.id &&
                            !countersError && (
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                                {displayedCounters.length}{" "}
                                {displayedCounters.length === 1 ? "counter" : "counters"}
                              </span>
                            )}
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          Create and manage physical or virtual service desks used by staff operators to call tickets.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleRetryCounters}
                        disabled={isCountersLoading || isCreatingCounter}
                        className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50"
                        aria-label="Refresh service counters"
                      >
                        <svg
                          className={`h-3.5 w-3.5 text-gray-500 ${
                            isCountersLoading ? "animate-spin" : ""
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="2"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                          />
                        </svg>
                        Refresh
                      </button>
                    </div>

                    {/* Create Counter Card */}
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-gray-900">
                          Add Service Counter
                        </h3>
                        <p className="mt-0.5 text-xs text-gray-500">
                          Enter a unique counter name for this organization (e.g., &ldquo;Counter 1&rdquo;, &ldquo;Window A&rdquo;, &ldquo;Consultation Desk 2&rdquo;).
                        </p>
                      </div>

                      <form onSubmit={handleCreateCounter} className="space-y-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                          <div className="flex-1">
                            <label htmlFor="new-counter-name" className="sr-only">
                              Counter Name
                            </label>
                            <input
                              id="new-counter-name"
                              type="text"
                              value={newCounterName}
                              onChange={(e) => {
                                setNewCounterName(e.target.value);
                                if (formError) setFormError(null);
                                if (formSuccess) setFormSuccess(null);
                              }}
                              placeholder="e.g., Counter 1 or Window A"
                              disabled={isCreatingCounter}
                              aria-invalid={Boolean(formError)}
                              aria-describedby={
                                formError
                                  ? "counter-form-error"
                                  : formSuccess
                                  ? "counter-form-success"
                                  : undefined
                              }
                              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={isCreatingCounter || !newCounterName.trim()}
                            className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none sm:w-auto"
                          >
                            {isCreatingCounter ? (
                              <>
                                <svg
                                  className="mr-2 h-4 w-4 animate-spin text-white"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  />
                                </svg>
                                Creating...
                              </>
                            ) : (
                              "Create Counter"
                            )}
                          </button>
                        </div>

                        {formError && (
                          <div
                            id="counter-form-error"
                            role="alert"
                            className="rounded-lg border border-red-200 bg-red-50/80 p-3 text-xs font-medium text-red-800 flex items-center gap-2"
                          >
                            <svg
                              className="h-4 w-4 text-red-600 shrink-0"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth="1.5"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                              />
                            </svg>
                            <span>{formError}</span>
                          </div>
                        )}

                        {formSuccess && (
                          <div
                            id="counter-form-success"
                            role="status"
                            className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 text-xs font-medium text-emerald-800 flex items-center gap-2"
                          >
                            <svg
                              className="h-4 w-4 text-emerald-600 shrink-0"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth="1.5"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                              />
                            </svg>
                            <span>{formSuccess}</span>
                          </div>
                        )}
                      </form>
                    </div>

                    {/* Counters List State Container */}
                    <div>
                      {isCountersLoading ? (
                        <CountersSkeleton />
                      ) : countersError ? (
                        <div
                          role="alert"
                          className="rounded-xl border border-red-200 bg-red-50/70 p-6 text-center text-red-800 shadow-sm"
                        >
                          <p className="text-sm font-medium">{countersError}</p>
                          <button
                            type="button"
                            onClick={handleRetryCounters}
                            className="mt-3 inline-flex items-center justify-center rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
                          >
                            Retry Loading Counters
                          </button>
                        </div>
                      ) : displayedCounters.length === 0 ? (
                        /* Empty State: No counters configured yet */
                        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
                          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                            <svg
                              className="h-5 w-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth="1.5"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3"
                              />
                            </svg>
                          </div>
                          <h4 className="mt-3 text-sm font-semibold text-gray-900">
                            No Service Counters Configured
                          </h4>
                          <p className="mt-1 text-xs text-gray-500 max-w-sm mx-auto">
                            Add your first counter above. Staff operators need active counters assigned to call and serve customer tickets.
                          </p>
                        </div>
                      ) : (
                        /* Populated State: Grid of Counters */
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {displayedCounters.map((counter) => (
                            <div
                              key={counter.id}
                              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-gray-300 flex flex-col justify-between gap-4"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-1">
                                  <h4 className="text-base font-semibold text-gray-900">
                                    {counter.name}
                                  </h4>
                                  <span className="block font-mono text-xs text-gray-400">
                                    ID: {counter.id}
                                  </span>
                                </div>
                                {counter.isActive ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200/80">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    Active
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600 border border-gray-200">
                                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                                    Inactive
                                  </span>
                                )}
                              </div>
                              <div className="border-t border-gray-100 pt-3 text-xs text-gray-400">
                                {formatCounterDate(counter.createdAt)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Upcoming Modules Preview Cards */}
                  <div className="space-y-4 pt-4 border-t border-gray-200/80">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                        Upcoming Administration Modules
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      {/* Services & Queues Card */}
                      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col justify-between opacity-80">
                        <div>
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
                            <svg
                              className="h-5 w-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth="1.5"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z"
                              />
                            </svg>
                          </div>
                          <h4 className="mt-4 text-base font-semibold text-gray-900">
                            Services & Queues
                          </h4>
                          <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                            Set up customer service categories and create active queues for walk-ins and appointments.
                          </p>
                        </div>
                        <div className="mt-6 border-t border-gray-100 pt-3">
                          <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500">
                            Step 3: Service & Queue Management
                          </span>
                        </div>
                      </div>

                      {/* Staff & Assignments Card */}
                      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col justify-between opacity-80">
                        <div>
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
                            <svg
                              className="h-5 w-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth="1.5"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
                              />
                            </svg>
                          </div>
                          <h4 className="mt-4 text-base font-semibold text-gray-900">
                            Staff & Assignments
                          </h4>
                          <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                            Onboard staff operators and assign them to active counters to manage queue flow.
                          </p>
                        </div>
                        <div className="mt-6 border-t border-gray-100 pt-3">
                          <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500">
                            Step 4: Staff Onboarding & Assignment
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
