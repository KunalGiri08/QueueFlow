"use client";

import { use, useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";

interface PublicQueue {
  id: string;
  name: string;
  isActive: boolean;
}

interface PublicService {
  id: string;
  name: string;
  description: string | null;
  queues: PublicQueue[];
}

interface OrganizationServicesData {
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  services: PublicService[];
}

interface PageProps {
  params: Promise<{ organizationId: string }>;
}

function ServicesLoadingSkeleton() {
  return (
    <div aria-label="Loading services" className="animate-pulse">
      <div className="mb-6 h-4 w-36 rounded bg-gray-200" />
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="h-9 w-64 rounded bg-gray-200" />
          <div className="h-6 w-20 rounded bg-gray-100" />
        </div>
        <div className="mt-3 h-4 w-48 rounded bg-gray-100" />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div
            key={idx}
            className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div>
              <div className="h-6 w-2/3 rounded bg-gray-200" />
              <div className="mt-3 h-4 w-5/6 rounded bg-gray-100" />
              <div className="mt-2 h-4 w-1/2 rounded bg-gray-100" />
            </div>
            <div className="mt-6 border-t border-gray-100 pt-4">
              <div className="mb-2 h-3 w-20 rounded bg-gray-100" />
              <div className="space-y-2">
                <div className="h-10 w-full rounded-lg bg-gray-100" />
                <div className="h-10 w-full rounded-lg bg-gray-100" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrganizationServicesContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ organizationId: string }>;
}) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const resolvedParams = use(paramsPromise);
  const navParams = useParams<{ organizationId: string }>();
  const organizationId =
    resolvedParams?.organizationId || navParams?.organizationId;

  const [data, setData] = useState<OrganizationServicesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  const [joiningQueueId, setJoiningQueueId] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<{
    queueId: string;
    message: string;
  } | null>(null);

  const fetchServices = useCallback(async () => {
    if (!organizationId) return;

    setIsLoading(true);
    setError(null);
    setIsNotFound(false);

    try {
      const response = await fetch(
        `/api/public/organizations/${encodeURIComponent(organizationId)}/services`,
      );

      if (response.status === 404) {
        setIsNotFound(true);
        setData(null);
        return;
      }

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const json: unknown = await response.json();

      if (
        !json ||
        typeof json !== "object" ||
        !("organization" in json) ||
        !("services" in json) ||
        !Array.isArray((json as { services: unknown }).services)
      ) {
        throw new Error("Malformed response format");
      }

      setData(json as OrganizationServicesData);
    } catch {
      setError("Unable to load services at this time. Please try again.");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const handleJoinQueue = async (queueId: string) => {
    if (!organizationId) return;

    if (!isSignedIn) {
      router.push(
        `/sign-in?redirect_url=${encodeURIComponent(`/organizations/${organizationId}`)}`,
      );
      return;
    }

    if (joiningQueueId === queueId) return;

    setQueueError((prev) => (prev?.queueId === queueId ? null : prev));
    setJoiningQueueId(queueId);

    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ queueId }),
      });

      if (response.status === 201) {
        const ticketData: unknown = await response.json();

        if (
          ticketData &&
          typeof ticketData === "object" &&
          "trackingToken" in ticketData &&
          typeof (ticketData as { trackingToken: unknown }).trackingToken ===
            "string" &&
          (ticketData as { trackingToken: string }).trackingToken.trim() !== ""
        ) {
          router.push(
            `/tickets/track/${encodeURIComponent(
              (ticketData as { trackingToken: string }).trackingToken,
            )}`,
          );
          return;
        }

        setQueueError({
          queueId,
          message: "Ticket created, but tracking information is unavailable.",
        });
        return;
      }

      if (response.status === 401) {
        router.push(
          `/sign-in?redirect_url=${encodeURIComponent(`/organizations/${organizationId}`)}`,
        );
        return;
      }

      if (response.status === 404) {
        setQueueError({
          queueId,
          message:
            "This queue is no longer active or could not be found. Please refresh the page.",
        });
        return;
      }

      if (response.status === 409) {
        let errorMessage = "You already have an active ticket in this queue.";
        try {
          const errJson: unknown = await response.json();
          if (
            errJson &&
            typeof errJson === "object" &&
            "error" in errJson &&
            typeof (errJson as { error: unknown }).error === "string" &&
            (errJson as { error: string }).error.trim() !== ""
          ) {
            errorMessage = (errJson as { error: string }).error;
          }
        } catch {
          // Fall back to default safe message
        }

        setQueueError({
          queueId,
          message: errorMessage,
        });
        return;
      }

      setQueueError({
        queueId,
        message: "Unable to join the queue at this time. Please try again.",
      });
    } catch {
      setQueueError({
        queueId,
        message:
          "Unable to join the queue at this time. Please check your connection and try again.",
      });
    } finally {
      setJoiningQueueId(null);
    }
  };

  if (isLoading) {
    return <ServicesLoadingSkeleton />;
  }

  if (isNotFound) {
    return (
      <div>
        <div className="mb-6">
          <Link
            href="/organizations"
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
          >
            <span aria-hidden="true">&larr;</span> Back to Organizations
          </Link>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">
            Organization not found
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            The organization you are looking for does not exist or may have been removed.
          </p>
          <div className="mt-6">
            <Link
              href="/organizations"
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              Back to Organizations
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="mb-6">
          <Link
            href="/organizations"
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
          >
            <span aria-hidden="true">&larr;</span> Back to Organizations
          </Link>
        </div>
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50/70 p-8 text-center text-red-800 shadow-sm"
        >
          <p className="text-base font-medium">{error}</p>
          <button
            type="button"
            onClick={fetchServices}
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/organizations"
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
        >
          <span aria-hidden="true">&larr;</span> Back to Organizations
        </Link>
      </div>

      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {data.organization.name}
          </h1>
          <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
            @{data.organization.slug}
          </span>
        </div>
        <p className="mt-2 text-base text-gray-600 sm:text-lg">
          Browse available services and queues for this organization.
        </p>
      </div>

      {data.services.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            No services available
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            This organization does not currently have any services listed. Please check back later.
          </p>
          <div className="mt-6">
            <Link
              href="/organizations"
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
            >
              Back to Organizations
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.services.map((service) => (
            <article
              key={service.id}
              className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-gray-900">
                  {service.name}
                </h2>
                {service.description && (
                  <p className="mt-2 text-sm text-gray-600">
                    {service.description}
                  </p>
                )}
              </div>

              <div className="mt-6 border-t border-gray-100 pt-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Active Queues
                </h3>
                {service.queues.length > 0 ? (
                  <div className="space-y-2.5">
                    {service.queues.map((queue) => {
                      const isSubmitting = joiningQueueId === queue.id;
                      const hasError = queueError?.queueId === queue.id;

                      return (
                        <div
                          key={queue.id}
                          className="flex flex-col rounded-lg border border-gray-200/80 bg-gray-50/60 p-3 transition-colors hover:border-gray-300"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full bg-green-500"
                                aria-hidden="true"
                              />
                              <span className="truncate text-sm font-medium text-gray-900">
                                {queue.name}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleJoinQueue(queue.id)}
                              disabled={
                                isSubmitting || joiningQueueId !== null
                              }
                              aria-label={
                                isSubmitting
                                  ? `Joining ${queue.name}...`
                                  : `Join ${queue.name}`
                              }
                              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isSubmitting ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <svg
                                    className="h-3.5 w-3.5 animate-spin"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth="2.5"
                                    stroke="currentColor"
                                    aria-hidden="true"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                                    />
                                  </svg>
                                  Joining...
                                </span>
                              ) : (
                                "Join Queue"
                              )}
                            </button>
                          </div>

                          {hasError && (
                            <div
                              role="alert"
                              className="mt-2.5 rounded-md border border-red-200 bg-red-50/80 p-2 text-xs text-red-700"
                            >
                              <p className="font-medium">
                                {queueError.message}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs font-medium text-gray-500">
                    No active queues
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrganizationServicesPage({ params }: PageProps) {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50/50 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Suspense fallback={<ServicesLoadingSkeleton />}>
            <OrganizationServicesContent paramsPromise={params} />
          </Suspense>
        </div>
      </main>
    </>
  );
}
