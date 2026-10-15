"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";

interface PublicOrganization {
  id: string;
  name: string;
  slug: string;
}

interface PublicOrganizationsResponse {
  organizations: PublicOrganization[];
  pagination: {
    page: number;
    limit: number;
  };
}

const PAGE_SIZE = 20;

function parsePage(param: string | null): number {
  if (!param || !/^\d+$/.test(param)) {
    return 1;
  }
  const parsed = Number(param);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1;
}

function OrganizationsLoadingSkeleton() {
  return (
    <div
      aria-label="Loading organizations"
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: 6 }).map((_, idx) => (
        <div
          key={idx}
          className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-6 shadow-sm animate-pulse"
        >
          <div>
            <div className="h-6 w-3/4 rounded bg-gray-200" />
            <div className="mt-3 h-4 w-1/3 rounded bg-gray-100" />
          </div>
          <div className="mt-6 border-t border-gray-100 pt-4 flex justify-end">
            <div className="h-9 w-28 rounded-lg bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

function OrganizationsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentPage = parsePage(searchParams.get("page"));

  const [organizations, setOrganizations] = useState<PublicOrganization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrganizations = useCallback(async (targetPage: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/public/organizations?page=${targetPage}&limit=${PAGE_SIZE}`,
      );

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const data: unknown = await response.json();

      if (
        !data ||
        typeof data !== "object" ||
        !("organizations" in data) ||
        !Array.isArray((data as { organizations: unknown }).organizations)
      ) {
        throw new Error("Malformed response format");
      }

      const validOrganizations = (
        data as PublicOrganizationsResponse
      ).organizations.filter(
        (org): org is PublicOrganization =>
          typeof org === "object" &&
          org !== null &&
          typeof org.id === "string" &&
          typeof org.name === "string" &&
          typeof org.slug === "string",
      );

      setOrganizations(validOrganizations);
    } catch {
      setError("Unable to load organizations at this time. Please try again.");
      setOrganizations([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations(currentPage);
  }, [currentPage, fetchOrganizations]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div>
      {isLoading ? (
        <OrganizationsLoadingSkeleton />
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50/70 p-8 text-center text-red-800 shadow-sm"
        >
          <p className="text-base font-medium">{error}</p>
          <button
            type="button"
            onClick={() => fetchOrganizations(currentPage)}
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            Retry
          </button>
        </div>
      ) : organizations.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            No organizations found
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {currentPage > 1
              ? "No organizations found on this page."
              : "There are currently no organizations available on QueueFlow. Please check back later."}
          </p>
          {currentPage > 1 && (
            <button
              type="button"
              onClick={() => handlePageChange(1)}
              className="mt-4 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
            >
              Back to Page 1
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {organizations.map((org) => (
            <article
              key={org.id}
              className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-gray-900">
                  {org.name}
                </h2>
                <span className="mt-2 inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                  @{org.slug}
                </span>
              </div>
              <div className="mt-6 flex items-center justify-end border-t border-gray-100 pt-4">
                <Link
                  href={`/organizations/${org.id}`}
                  className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
                  aria-label={`View services at ${org.name}`}
                >
                  View services
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {!error && (organizations.length > 0 || currentPage > 1) && (
        <nav
          aria-label="Pagination"
          className="mt-10 flex items-center justify-between border-t border-gray-200 pt-6"
        >
          <div>
            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1 || isLoading}
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
          </div>

          <p className="text-sm font-medium text-gray-700">
            Page <span className="font-semibold text-gray-900">{currentPage}</span>
          </p>

          <div>
            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={organizations.length < PAGE_SIZE || isLoading}
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

export default function OrganizationsPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50/50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Explore Organizations
            </h1>
            <p className="mt-2 text-base text-gray-600 sm:text-lg">
              Discover organizations using QueueFlow and get started with virtual queuing.
            </p>
          </div>

          <Suspense fallback={<OrganizationsLoadingSkeleton />}>
            <OrganizationsContent />
          </Suspense>
        </div>
      </main>
    </>
  );
}
