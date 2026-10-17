"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";

interface CurrentUser {
  id: string;
  name: string | null;
  email: string;
}

interface OrganizationItem {
  id: string;
  name: string;
  slug: string;
}

interface CounterData {
  id: string;
  name: string;
  isActive: boolean;
  organizationId: string;
}

interface AssignedCounterItem {
  id: string;
  staffId: string;
  counter: CounterData;
}

interface ActiveTicket {
  id: string;
  number: number;
  status: "CALLED" | "SERVING";
  queueId: string;
  counterId: string | null;
  createdAt: string;
  updatedAt: string;
  queue: {
    id: string;
    name: string;
    service?: {
      id: string;
      name: string;
    };
  };
  service: {
    id: string;
    name: string;
  };
  counter: {
    id: string;
    name: string;
  } | null;
}

function getStatusBadgeConfig(status: string) {
  switch (status) {
    case "CALLED":
      return {
        label: "Called",
        badgeClasses: "bg-blue-50 text-blue-800 border-blue-200/80 animate-pulse",
        dotClass: "bg-blue-600",
      };
    case "SERVING":
      return {
        label: "Now Serving",
        badgeClasses: "bg-green-50 text-green-800 border-green-200/80",
        dotClass: "bg-green-600",
      };
    default:
      return {
        label: status,
        badgeClasses: "bg-gray-100 text-gray-800 border-gray-200",
        dotClass: "bg-gray-500",
      };
  }
}

function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return isoString;
  }
}

function StaffLoadingSkeleton() {
  return (
    <div aria-label="Loading staff console" className="space-y-6 animate-pulse">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 rounded bg-gray-200" />
            <div className="h-4 w-64 rounded bg-gray-100" />
          </div>
          <div className="h-10 w-44 rounded-lg bg-gray-200" />
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="h-6 w-36 rounded bg-gray-200 mb-4" />
        <div className="h-20 w-full rounded bg-gray-100" />
      </div>
    </div>
  );
}

function OrgDataSkeleton() {
  return (
    <div aria-label="Loading operator data" className="space-y-6 animate-pulse">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="h-5 w-40 rounded bg-gray-200" />
            <div className="h-4 w-60 rounded bg-gray-100" />
          </div>
          <div className="h-10 w-48 rounded-lg bg-gray-200" />
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="h-6 w-32 rounded bg-gray-200 mb-4" />
        <div className="h-16 w-full rounded bg-gray-100" />
      </div>
    </div>
  );
}

export default function StaffOperatorPage() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Step 2 state: Assigned counters, selected counter, recovered active ticket
  const [assignedCounters, setAssignedCounters] = useState<AssignedCounterItem[]>([]);
  const [selectedCounterId, setSelectedCounterId] = useState<string | null>(null);
  const [activeTicket, setActiveTicket] = useState<ActiveTicket | null>(null);
  const [counterWarning, setCounterWarning] = useState<string | null>(null);
  const [isOrgDataLoading, setIsOrgDataLoading] = useState(false);
  const [orgDataError, setOrgDataError] = useState<string | null>(null);

  const fetchSessionData = useCallback(
    async (showSkeleton = true) => {
      if (showSkeleton) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const [meRes, orgsRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/organizations"),
        ]);

        if (meRes.status === 401 || orgsRes.status === 401) {
          router.push(`/sign-in?redirect_url=${encodeURIComponent("/staff")}`);
          return;
        }

        if (!meRes.ok) {
          throw new Error(`Failed to load profile (status ${meRes.status})`);
        }

        if (!orgsRes.ok) {
          throw new Error(
            `Failed to load organizations (status ${orgsRes.status})`,
          );
        }

        const meJson: unknown = await meRes.json();
        const orgsJson: unknown = await orgsRes.json();

        if (
          !meJson ||
          typeof meJson !== "object" ||
          !("id" in meJson) ||
          typeof (meJson as { id: unknown }).id !== "string"
        ) {
          throw new Error("Malformed profile response");
        }

        if (!Array.isArray(orgsJson)) {
          throw new Error("Malformed organizations response");
        }

        const validatedUser: CurrentUser = {
          id: (meJson as { id: string }).id,
          name:
            "name" in meJson &&
            typeof (meJson as { name: unknown }).name === "string"
              ? (meJson as { name: string }).name
              : null,
          email:
            "email" in meJson &&
            typeof (meJson as { email: unknown }).email === "string"
              ? (meJson as { email: string }).email
              : "",
        };

        const validatedOrgs: OrganizationItem[] = orgsJson.filter(
          (org): org is OrganizationItem =>
            typeof org === "object" &&
            org !== null &&
            typeof (org as { id?: unknown }).id === "string" &&
            typeof (org as { name?: unknown }).name === "string" &&
            typeof (org as { slug?: unknown }).slug === "string",
        );

        setUser(validatedUser);
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
        setError(
          "Unable to load your operator session at this time. Please try again.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [router],
  );

  const fetchOrgOperatorData = useCallback(
    async (orgId: string, staffId: string) => {
      const [countersRes, ticketRes] = await Promise.all([
        fetch(
          `/api/organizations/${encodeURIComponent(orgId)}/staff/${encodeURIComponent(staffId)}/counters`,
        ),
        fetch(
          `/api/organizations/${encodeURIComponent(orgId)}/staff/${encodeURIComponent(staffId)}/active-ticket`,
        ),
      ]);

      if (countersRes.status === 401 || ticketRes.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/staff")}`);
        return null;
      }

      if (!countersRes.ok) {
        throw new Error(
          `Failed to load assigned counters (status ${countersRes.status})`,
        );
      }

      if (!ticketRes.ok) {
        throw new Error(
          `Failed to load active ticket (status ${ticketRes.status})`,
        );
      }

      const countersJson: unknown = await countersRes.json();
      const ticketJson: unknown = await ticketRes.json();

      if (!Array.isArray(countersJson)) {
        throw new Error("Malformed counters response");
      }

      const validAssignments: AssignedCounterItem[] = countersJson.filter(
        (item): item is AssignedCounterItem => {
          if (typeof item !== "object" || item === null) return false;
          const rec = item as Record<string, unknown>;
          if (typeof rec.id !== "string" || typeof rec.staffId !== "string") return false;
          if (typeof rec.counter !== "object" || rec.counter === null) return false;
          const counterRec = rec.counter as Record<string, unknown>;
          return (
            typeof counterRec.id === "string" &&
            typeof counterRec.name === "string" &&
            typeof counterRec.isActive === "boolean" &&
            typeof counterRec.organizationId === "string"
          );
        },
      );

      if (
        !ticketJson ||
        typeof ticketJson !== "object" ||
        !("ticket" in ticketJson)
      ) {
        throw new Error("Malformed active-ticket response");
      }

      const rawTicket = (ticketJson as { ticket: unknown }).ticket;
      let validActiveTicket: ActiveTicket | null = null;

      if (rawTicket !== null && typeof rawTicket === "object") {
        const ticketRec = rawTicket as Record<string, unknown>;
        const rawQueue = ticketRec.queue;
        const rawService = ticketRec.service;
        const rawCounter = ticketRec.counter;

        if (
          typeof ticketRec.id === "string" &&
          typeof ticketRec.number === "number" &&
          (ticketRec.status === "CALLED" || ticketRec.status === "SERVING") &&
          typeof ticketRec.queueId === "string" &&
          typeof ticketRec.createdAt === "string" &&
          typeof ticketRec.updatedAt === "string" &&
          typeof rawQueue === "object" &&
          rawQueue !== null &&
          typeof (rawQueue as Record<string, unknown>).id === "string" &&
          typeof (rawQueue as Record<string, unknown>).name === "string" &&
          typeof rawService === "object" &&
          rawService !== null &&
          typeof (rawService as Record<string, unknown>).id === "string" &&
          typeof (rawService as Record<string, unknown>).name === "string"
        ) {
          const counterObj =
            typeof rawCounter === "object" &&
            rawCounter !== null &&
            typeof (rawCounter as Record<string, unknown>).id === "string" &&
            typeof (rawCounter as Record<string, unknown>).name === "string"
              ? {
                  id: (rawCounter as Record<string, unknown>).id as string,
                  name: (rawCounter as Record<string, unknown>).name as string,
                }
              : null;

          validActiveTicket = {
            id: ticketRec.id,
            number: ticketRec.number,
            status: ticketRec.status as "CALLED" | "SERVING",
            queueId: ticketRec.queueId,
            counterId:
              typeof ticketRec.counterId === "string"
                ? ticketRec.counterId
                : null,
            createdAt: ticketRec.createdAt,
            updatedAt: ticketRec.updatedAt,
            queue: {
              id: (rawQueue as Record<string, unknown>).id as string,
              name: (rawQueue as Record<string, unknown>).name as string,
            },
            service: {
              id: (rawService as Record<string, unknown>).id as string,
              name: (rawService as Record<string, unknown>).name as string,
            },
            counter: counterObj,
          };
        }
      }

      let determinedCounterId: string | null = null;
      let warning: string | null = null;

      if (validActiveTicket && validActiveTicket.counterId) {
        const matchingAssignment = validAssignments.find(
          (a) => a.counter.id === validActiveTicket!.counterId,
        );

        if (matchingAssignment && matchingAssignment.counter.isActive) {
          determinedCounterId = matchingAssignment.counter.id;
        } else if (!matchingAssignment) {
          const counterName =
            validActiveTicket.counter?.name || validActiveTicket.counterId;
          warning = `This active ticket is tied to Counter "${counterName}", which is no longer assigned to your account in this organization.`;
        } else {
          warning = `This active ticket is tied to Counter "${matchingAssignment.counter.name}", which is currently inactive.`;
        }
      } else {
        const activeCounters = validAssignments.filter(
          (a) => a.counter.isActive,
        );
        if (activeCounters.length > 0) {
          determinedCounterId = activeCounters[0].counter.id;
        }
      }

      return {
        assignments: validAssignments,
        activeTicket: validActiveTicket,
        counterId: determinedCounterId,
        warning,
      };
    },
    [router],
  );

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=${encodeURIComponent("/staff")}`);
      return;
    }

    fetchSessionData();
  }, [isLoaded, isSignedIn, router, fetchSessionData]);

  // Step 2 effect: Load assigned counters and active ticket when selected organization changes
  useEffect(() => {
    if (!selectedOrgId || !user?.id) return;

    let isCurrent = true;
    setIsOrgDataLoading(true);
    setOrgDataError(null);

    // Clear previous organization state immediately to satisfy requirement 7
    setAssignedCounters([]);
    setSelectedCounterId(null);
    setActiveTicket(null);
    setCounterWarning(null);

    fetchOrgOperatorData(selectedOrgId, user.id)
      .then((data) => {
        if (!isCurrent || !data) return;
        setAssignedCounters(data.assignments);
        setActiveTicket(data.activeTicket);
        setSelectedCounterId(data.counterId);
        setCounterWarning(data.warning);
      })
      .catch(() => {
        if (!isCurrent) return;
        setOrgDataError(
          "Unable to load assigned counters and active ticket for this organization. Please try again.",
        );
      })
      .finally(() => {
        if (isCurrent) {
          setIsOrgDataLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedOrgId, user?.id, fetchOrgOperatorData]);

  const handleOrgChange = (newOrgId: string) => {
    if (newOrgId === selectedOrgId) return;
    setAssignedCounters([]);
    setSelectedCounterId(null);
    setActiveTicket(null);
    setCounterWarning(null);
    setOrgDataError(null);
    setSelectedOrgId(newOrgId);
  };

  const handleRetryOrgData = () => {
    if (!selectedOrgId || !user?.id) return;
    setIsOrgDataLoading(true);
    setOrgDataError(null);
    fetchOrgOperatorData(selectedOrgId, user.id)
      .then((data) => {
        if (!data) return;
        setAssignedCounters(data.assignments);
        setActiveTicket(data.activeTicket);
        setSelectedCounterId(data.counterId);
        setCounterWarning(data.warning);
      })
      .catch(() => {
        setOrgDataError(
          "Unable to load assigned counters and active ticket for this organization. Please try again.",
        );
      })
      .finally(() => {
        setIsOrgDataLoading(false);
      });
  };

  const selectedOrganization =
    organizations.find((org) => org.id === selectedOrgId) ?? null;

  const activeAssignedCounters = assignedCounters.filter(
    (a) => a.counter.isActive,
  );
  const inactiveAssignedCounters = assignedCounters.filter(
    (a) => !a.counter.isActive,
  );

  const activeBadgeConfig = activeTicket
    ? getStatusBadgeConfig(activeTicket.status)
    : null;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50/50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Staff Operator Console
              </h1>
              <p className="mt-2 text-base text-gray-600 sm:text-lg">
                Manage counters, call waiting customers, and serve tickets.
              </p>
            </div>
            {user && (
              <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="font-medium text-gray-900">
                  {user.name || user.email}
                </span>
              </div>
            )}
          </div>

          {!isLoaded || (!isSignedIn && isLoaded) || isLoading ? (
            <StaffLoadingSkeleton />
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50/70 p-8 text-center text-red-800 shadow-sm"
            >
              <p className="text-base font-medium">{error}</p>
              <button
                type="button"
                onClick={() => fetchSessionData(true)}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                Retry
              </button>
            </div>
          ) : organizations.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
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
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                  />
                </svg>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-gray-900">
                No Organization Memberships
              </h2>
              <p className="mt-2 text-sm text-gray-600 max-w-md mx-auto">
                Your account ({user?.email || "signed-in"}) is not currently a
                member of any organization. Ask an organization administrator to
                invite you or assign you to staff.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link
                  href="/organizations"
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
                >
                  Explore Public Organizations
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Organization Selection Bar */}
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      Organization
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Select the organization you are operating for today.
                    </p>
                  </div>
                  {organizations.length > 1 ? (
                    <div className="min-w-[240px]">
                      <label htmlFor="org-select" className="sr-only">
                        Select Organization
                      </label>
                      <select
                        id="org-select"
                        value={selectedOrgId ?? ""}
                        onChange={(e) => handleOrgChange(e.target.value)}
                        className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      >
                        {organizations.map((org) => (
                          <option key={org.id} value={org.id}>
                            {org.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    selectedOrganization && (
                      <span className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-900">
                        {selectedOrganization.name}
                      </span>
                    )
                  )}
                </div>
              </div>

              {/* Organization Operator Data Area */}
              {isOrgDataLoading ? (
                <OrgDataSkeleton />
              ) : orgDataError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50/70 p-6 text-center text-red-800 shadow-sm"
                >
                  <p className="text-sm font-medium">{orgDataError}</p>
                  <button
                    type="button"
                    onClick={handleRetryOrgData}
                    className="mt-3 inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
                  >
                    Retry Loading
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Assigned Counter Selector or Empty State */}
                  {assignedCounters.length === 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-6 text-amber-900 shadow-sm">
                      <div className="flex items-start gap-3">
                        <svg
                          className="h-5 w-5 text-amber-600 mt-0.5 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="1.5"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                          />
                        </svg>
                        <div>
                          <h4 className="text-sm font-semibold text-amber-900">
                            No Counters Assigned
                          </h4>
                          <p className="mt-1 text-sm text-amber-800">
                            You are not currently assigned to any counters in{" "}
                            <span className="font-semibold">
                              {selectedOrganization?.name}
                            </span>
                            . An organization administrator must assign you to an
                            active desk before you can call or serve tickets.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : activeAssignedCounters.length === 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-6 text-amber-900 shadow-sm">
                      <div className="flex items-start gap-3">
                        <svg
                          className="h-5 w-5 text-amber-600 mt-0.5 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="1.5"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                          />
                        </svg>
                        <div>
                          <h4 className="text-sm font-semibold text-amber-900">
                            All Assigned Counters Inactive
                          </h4>
                          <p className="mt-1 text-sm text-amber-800">
                            All counters assigned to your account in this
                            organization are currently inactive. An administrator
                            must reactivate a desk before tickets can be served.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <label
                            htmlFor="counter-select"
                            className="text-lg font-semibold text-gray-900"
                          >
                            Assigned Desk / Counter
                          </label>
                          <p className="mt-1 text-sm text-gray-500">
                            Select the active counter from which you will call
                            and serve customers.
                          </p>
                        </div>
                        <div className="min-w-[240px]">
                          <select
                            id="counter-select"
                            value={selectedCounterId ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (
                                activeAssignedCounters.some(
                                  (a) => a.counter.id === val,
                                )
                              ) {
                                setSelectedCounterId(val);
                                if (
                                  activeTicket &&
                                  activeTicket.counterId === val
                                ) {
                                  setCounterWarning(null);
                                }
                              }
                            }}
                            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                          >
                            {activeAssignedCounters.map((item) => (
                              <option
                                key={item.counter.id}
                                value={item.counter.id}
                              >
                                {item.counter.name} (Active)
                              </option>
                            ))}
                            {inactiveAssignedCounters.map((item) => (
                              <option
                                key={item.counter.id}
                                value={item.counter.id}
                                disabled
                              >
                                {item.counter.name} (Inactive)
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Counter Inactivity or Mismatch Warning Banner */}
                  {counterWarning && (
                    <div
                      role="alert"
                      className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <svg
                          className="h-5 w-5 text-amber-600 mt-0.5 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="1.5"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                          />
                        </svg>
                        <div>
                          <p className="text-sm font-semibold">{counterWarning}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Active Ticket Card or Idle State */}
                  {activeTicket ? (
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                            Current Active Ticket
                          </span>
                          {activeBadgeConfig && (
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${activeBadgeConfig.badgeClasses}`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${activeBadgeConfig.dotClass}`}
                              />
                              {activeBadgeConfig.label}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">
                          Updated {formatTimestamp(activeTicket.updatedAt)}
                        </span>
                      </div>

                      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-4xl font-black tracking-tight text-gray-900 sm:text-5xl">
                            #{activeTicket.number}
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                            <span className="font-medium text-gray-900">
                              {activeTicket.service.name}
                            </span>
                            <span className="text-gray-300">•</span>
                            <span>Queue: {activeTicket.queue.name}</span>
                            <span className="text-gray-300">•</span>
                            <span>
                              Counter:{" "}
                              {activeTicket.counter?.name ?? "Unavailable"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="1.5"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                          />
                        </svg>
                      </div>
                      <h3 className="mt-3 text-base font-semibold text-gray-900">
                        No Active Ticket
                      </h3>
                      <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
                        You are not currently serving any ticket in this
                        organization. Select an active desk to prepare for queue
                        operations.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
