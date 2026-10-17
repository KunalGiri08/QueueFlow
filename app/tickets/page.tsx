"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";

export type TicketStatus =
  | "WAITING"
  | "CALLED"
  | "SERVING"
  | "COMPLETED"
  | "SKIPPED"
  | "CANCELLED";

interface CustomerTicket {
  id: string;
  trackingToken: string | null;
  number: number;
  status: TicketStatus | string;
  createdAt: string;
  updatedAt: string;
  queue: {
    id: string;
    name: string;
    service: {
      id: string;
      name: string;
      organization: {
        id: string;
        name: string;
      };
    };
  };
}

function getStatusBadgeConfig(status: string) {
  switch (status) {
    case "WAITING":
      return {
        label: "Waiting in Line",
        badgeClasses: "bg-amber-50 text-amber-800 border-amber-200/80",
        dotClass: "bg-amber-500",
      };
    case "CALLED":
      return {
        label: "Ticket Called",
        badgeClasses:
          "bg-blue-50 text-blue-800 border-blue-200/80 animate-pulse",
        dotClass: "bg-blue-600",
      };
    case "SERVING":
      return {
        label: "Now Serving",
        badgeClasses: "bg-green-50 text-green-800 border-green-200/80",
        dotClass: "bg-green-600",
      };
    case "COMPLETED":
      return {
        label: "Completed",
        badgeClasses: "bg-gray-100 text-gray-800 border-gray-200",
        dotClass: "bg-gray-500",
      };
    case "SKIPPED":
      return {
        label: "Skipped",
        badgeClasses: "bg-orange-50 text-orange-800 border-orange-200/80",
        dotClass: "bg-orange-500",
      };
    case "CANCELLED":
      return {
        label: "Cancelled",
        badgeClasses: "bg-red-50 text-red-800 border-red-200/80",
        dotClass: "bg-red-500",
      };
    default:
      return {
        label: status,
        badgeClasses: "bg-gray-100 text-gray-800 border-gray-200",
        dotClass: "bg-gray-500",
      };
  }
}

function formatTicketDate(isoString: string): string {
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

function TicketsLoadingSkeleton() {
  return (
    <div aria-label="Loading your tickets" className="space-y-4 animate-pulse">
      {Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-8 w-16 rounded bg-gray-200" />
                <div className="h-6 w-28 rounded-full bg-gray-100" />
              </div>
              <div className="h-5 w-48 rounded bg-gray-200" />
              <div className="h-4 w-40 rounded bg-gray-100" />
              <div className="h-3 w-32 rounded bg-gray-100" />
            </div>
            <div className="h-9 w-32 rounded-lg bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MyTicketsPage() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();

  const [tickets, setTickets] = useState<CustomerTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/tickets");

      if (response.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/tickets")}`);
        return;
      }

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const json: unknown = await response.json();

      if (!Array.isArray(json)) {
        throw new Error("Malformed response format");
      }

      const validTickets: CustomerTicket[] = json.filter(
        (item): item is CustomerTicket =>
          typeof item === "object" &&
          item !== null &&
          typeof item.id === "string" &&
          typeof item.number === "number" &&
          typeof item.status === "string" &&
          typeof item.createdAt === "string" &&
          typeof item.queue === "object" &&
          item.queue !== null &&
          typeof item.queue.name === "string" &&
          typeof item.queue.service === "object" &&
          item.queue.service !== null &&
          typeof item.queue.service.name === "string" &&
          typeof item.queue.service.organization === "object" &&
          item.queue.service.organization !== null &&
          typeof item.queue.service.organization.name === "string",
      );

      setTickets(validTickets);
    } catch {
      setError("Unable to load your tickets at this time. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=${encodeURIComponent("/tickets")}`);
      return;
    }

    fetchTickets();
  }, [isLoaded, isSignedIn, router, fetchTickets]);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50/50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              My Tickets
            </h1>
            <p className="mt-2 text-base text-gray-600 sm:text-lg">
              View your active queue positions and past ticket history.
            </p>
          </div>

          {!isLoaded || (!isSignedIn && isLoaded) || isLoading ? (
            <TicketsLoadingSkeleton />
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50/70 p-8 text-center text-red-800 shadow-sm"
            >
              <p className="text-base font-medium">{error}</p>
              <button
                type="button"
                onClick={fetchTickets}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                Retry
              </button>
            </div>
          ) : tickets.length === 0 ? (
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
                    d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z"
                  />
                </svg>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-gray-900">
                No tickets yet
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                You haven&apos;t joined any queues yet. Explore available
                organizations and services to get your virtual ticket.
              </p>
              <div className="mt-6">
                <Link
                  href="/organizations"
                  className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
                >
                  Explore Organizations
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {tickets.map((ticket) => {
                const statusConfig = getStatusBadgeConfig(ticket.status);
                const hasValidToken =
                  typeof ticket.trackingToken === "string" &&
                  ticket.trackingToken.trim() !== "";

                return (
                  <article
                    key={ticket.id}
                    className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">
                            #{ticket.number}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusConfig.badgeClasses}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${statusConfig.dotClass}`}
                              aria-hidden="true"
                            />
                            {statusConfig.label}
                          </span>
                        </div>

                        <p className="mt-1 text-sm font-semibold text-gray-800">
                          {ticket.queue.service.organization.name}
                        </p>

                        <p className="mt-0.5 text-xs text-gray-500">
                          {ticket.queue.service.name} &bull; {ticket.queue.name}
                        </p>

                        <p className="mt-2 text-xs text-gray-400">
                          Joined {formatTicketDate(ticket.createdAt)}
                        </p>
                      </div>

                      <div className="flex sm:flex-col sm:items-end justify-between items-center gap-2 pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                        {hasValidToken ? (
                          <Link
                            href={`/tickets/track/${encodeURIComponent(ticket.trackingToken!)}`}
                            className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
                          >
                            Track Status &rarr;
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-400 italic">
                            Tracking unavailable
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
