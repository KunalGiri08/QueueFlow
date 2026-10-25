"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { OrganizationSelector, type OrganizationItem } from "@/components/admin/OrganizationSelector";
import { OrganizationAnalytics } from "@/components/admin/OrganizationAnalytics";
import { CounterManagement } from "@/components/admin/CounterManagement";
import { ServiceManagement } from "@/components/admin/ServiceManagement";
import { QueueManagement } from "@/components/admin/QueueManagement";
import { OperatingHoursManagement } from "@/components/admin/OperatingHoursManagement";
import { StaffManagement } from "@/components/admin/StaffManagement";

type AdminAuthResult = "authorized" | "forbidden" | "error";

function AdminSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading admin dashboard"
      className="space-y-6 animate-pulse"
    >
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
      role="status"
      aria-busy="true"
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

  // Stale request prevention refs
  const activeOrgControllerRef = useRef<AbortController | null>(null);
  const orgFetchGenerationRef = useRef<number>(0);
  const activeVerifyControllerRef = useRef<AbortController | null>(null);
  const verifyGenerationRef = useRef<number>(0);

  const fetchOrganizations = useCallback(async (signal?: AbortSignal) => {
    if (signal?.aborted) return;

    const fetchGen = ++orgFetchGenerationRef.current;
    setIsSessionLoading(true);
    setSessionError(null);

    try {
      const response = await fetch("/api/organizations", { signal });

      if (signal?.aborted || orgFetchGenerationRef.current !== fetchGen) return;

      if (response.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to load organizations (status ${response.status})`);
      }

      const orgsJson: unknown = await response.json();

      if (signal?.aborted || orgFetchGenerationRef.current !== fetchGen) return;

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

      if (signal?.aborted || orgFetchGenerationRef.current !== fetchGen) return;

      setOrganizations(validatedOrgs);

      setSelectedOrgId((currentSelected) => {
        if (
          currentSelected &&
          validatedOrgs.some((org) => org.id === currentSelected)
        ) {
          return currentSelected;
        }
        const nextId = validatedOrgs.length > 0 ? validatedOrgs[0].id : null;
        if (nextId !== currentSelected) {
          setVerifiedOrgId(null);
          setAdminAuthResult(null);
          setAdminError(null);
        }
        return nextId;
      });
    } catch (err: unknown) {
      if (signal?.aborted || orgFetchGenerationRef.current !== fetchGen) return;
      const isAbort =
        (err instanceof Error && err.name === "AbortError") ||
        (typeof err === "object" &&
          err !== null &&
          "name" in err &&
          (err as { name: string }).name === "AbortError") ||
        Boolean(signal?.aborted);
      if (isAbort) {
        return;
      }
      setSessionError(
        "Unable to load your organizations at this time. Please try again.",
      );
    } finally {
      if (!signal?.aborted && orgFetchGenerationRef.current === fetchGen) {
        setIsSessionLoading(false);
      }
    }
  }, [router]);

  // Auth gate effect: handle Clerk initialization and sign-out redirect
  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
      return;
    }

    if (activeOrgControllerRef.current) {
      activeOrgControllerRef.current.abort();
    }

    const controller = new AbortController();
    activeOrgControllerRef.current = controller;
    void Promise.resolve().then(() => fetchOrganizations(controller.signal));

    return () => {
      controller.abort();
      activeOrgControllerRef.current?.abort();
      activeOrgControllerRef.current = null;
      activeVerifyControllerRef.current?.abort();
      activeVerifyControllerRef.current = null;
    };
  }, [isLoaded, isSignedIn, router, fetchOrganizations]);

  const handleRetryOrganizations = () => {
    if (activeVerifyControllerRef.current) {
      activeVerifyControllerRef.current.abort();
      activeVerifyControllerRef.current = null;
    }
    if (activeOrgControllerRef.current) {
      activeOrgControllerRef.current.abort();
    }
    setVerifiedOrgId(null);
    setAdminAuthResult(null);
    setAdminError(null);
    const controller = new AbortController();
    activeOrgControllerRef.current = controller;
    void fetchOrganizations(controller.signal);
  };

  // Verification effect: triggers whenever selected organization changes or retry is triggered
  useEffect(() => {
    if (!selectedOrgId) {
      setVerifiedOrgId(null);
      setAdminAuthResult(null);
      setAdminError(null);
      return;
    }

    if (activeVerifyControllerRef.current) {
      activeVerifyControllerRef.current.abort();
    }

    const verifyGen = ++verifyGenerationRef.current;
    let isCurrent = true;
    const controller = new AbortController();
    activeVerifyControllerRef.current = controller;

    fetch(`/api/staff?organizationId=${encodeURIComponent(selectedOrgId)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!isCurrent || controller.signal.aborted || verifyGenerationRef.current !== verifyGen) return;

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
        if (!isCurrent || controller.signal.aborted || verifyGenerationRef.current !== verifyGen) return;
        const isAbort =
          (err instanceof Error && err.name === "AbortError") ||
          (typeof err === "object" &&
            err !== null &&
            "name" in err &&
            (err as { name: string }).name === "AbortError") ||
          controller.signal.aborted;
        if (isAbort) {
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
      if (activeVerifyControllerRef.current === controller) {
        activeVerifyControllerRef.current = null;
      }
    };
  }, [selectedOrgId, verifyRetryTrigger, router]);

  const handleRetryVerification = () => {
    if (!selectedOrgId) return;
    if (activeVerifyControllerRef.current) {
      activeVerifyControllerRef.current.abort();
      activeVerifyControllerRef.current = null;
    }
    setVerifiedOrgId(null);
    setAdminAuthResult(null);
    setAdminError(null);
    setVerifyRetryTrigger((prev) => prev + 1);
  };

  const handleSelectOrg = (newId: string) => {
    if (newId === selectedOrgId) return;
    if (activeVerifyControllerRef.current) {
      activeVerifyControllerRef.current.abort();
      activeVerifyControllerRef.current = null;
    }
    setVerifiedOrgId(null);
    setAdminAuthResult(null);
    setAdminError(null);
    setSelectedOrgId(newId);
  };

  const selectedOrg = organizations.find((org) => org.id === selectedOrgId) ?? null;
  const isVerifying = Boolean(selectedOrgId && (verifiedOrgId !== selectedOrgId || adminAuthResult === null));

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
                onClick={handleRetryOrganizations}
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
              <OrganizationSelector
                organizations={organizations}
                selectedOrgId={selectedOrgId}
                onSelectOrg={handleSelectOrg}
              />

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

                  {/* Section: Organization Analytics */}
                  <OrganizationAnalytics organizationId={selectedOrg.id} />

                  {/* Section: Counter Management (Step 2) */}
                  <CounterManagement organizationId={selectedOrg.id} />

                  {/* Section: Service Management (Step 3A) */}
                  <ServiceManagement organizationId={selectedOrg.id} />

                  {/* Section: Queue Management (Step 3B) */}
                  <QueueManagement organizationId={selectedOrg.id} />

                  {/* Section: Operating Hours & Exceptional Closures */}
                  <OperatingHoursManagement organizationId={selectedOrg.id} />

                  {/* Section: Staff & Counter Assignments (Step 4) */}
                  <StaffManagement organizationId={selectedOrg.id} />
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
