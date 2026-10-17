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

export default function StaffOperatorPage() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=${encodeURIComponent("/staff")}`);
      return;
    }

    fetchSessionData();
  }, [isLoaded, isSignedIn, router, fetchSessionData]);

  const selectedOrganization =
    organizations.find((org) => org.id === selectedOrgId) ?? null;

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
                        onChange={(e) => setSelectedOrgId(e.target.value)}
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

              {selectedOrganization && (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
                  <h3 className="text-base font-semibold text-gray-900">
                    Active Organization: {selectedOrganization.name}
                  </h3>
                  <p className="mt-2 text-sm text-gray-500">
                    Operator ID verified. Ready for counter and queue assignment.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
