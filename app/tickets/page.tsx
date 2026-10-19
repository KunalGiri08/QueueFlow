"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Navbar } from "@/components/Navbar";
import { CustomerTicketCard } from "@/components/tickets/CustomerTicketCard";
import { CustomerTicketsEmptyState } from "@/components/tickets/CustomerTicketsEmptyState";
import type { TicketStatus } from "@/lib/formatters/ticket";

export type { TicketStatus };

export interface CustomerTicket {
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
  const [cancellingTicketId, setCancellingTicketId] = useState<string | null>(
    null,
  );
  const [actionError, setActionError] = useState<{
    ticketId: string;
    message: string;
  } | null>(null);

  const activeFetchControllerRef = useRef<AbortController | null>(null);
  const fetchGenerationRef = useRef<number>(0);

  const fetchTickets = useCallback(
    async (showSkeleton = true) => {
      if (activeFetchControllerRef.current) {
        activeFetchControllerRef.current.abort();
      }

      const controller = new AbortController();
      activeFetchControllerRef.current = controller;
      const currentGen = ++fetchGenerationRef.current;

      if (showSkeleton) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const response = await fetch("/api/tickets", {
          signal: controller.signal,
        });

        if (currentGen !== fetchGenerationRef.current) return;

        if (response.status === 401) {
          router.push(`/sign-in?redirect_url=${encodeURIComponent("/tickets")}`);
          return;
        }

        if (!response.ok) {
          throw new Error(`Server returned status ${response.status}`);
        }

        const json: unknown = await response.json();

        if (currentGen !== fetchGenerationRef.current) return;

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

        if (currentGen !== fetchGenerationRef.current) return;
        setTickets(validTickets);
      } catch (err: unknown) {
        if (currentGen !== fetchGenerationRef.current) return;
        if (
          (err instanceof DOMException && err.name === "AbortError") ||
          (err instanceof Error && err.name === "AbortError")
        ) {
          return;
        }
        setError("Unable to load your tickets at this time. Please try again.");
      } finally {
        if (currentGen === fetchGenerationRef.current) {
          setIsLoading(false);
          activeFetchControllerRef.current = null;
        }
      }
    },
    [router],
  );

  const handleCancelTicket = async (ticket: CustomerTicket) => {
    if (cancellingTicketId) return;

    const confirmed = window.confirm(
      `Are you sure you want to cancel ticket #${ticket.number}? You will lose your position in line.`,
    );
    if (!confirmed) return;

    setActionError(null);
    setCancellingTicketId(ticket.id);

    try {
      const response = await fetch(
        `/api/tickets/${encodeURIComponent(ticket.id)}/cancel`,
        {
          method: "PATCH",
        },
      );

      if (response.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/tickets")}`);
        return;
      }

      if (response.status === 409) {
        setActionError({
          ticketId: ticket.id,
          message:
            "This ticket can no longer be cancelled because its status has changed.",
        });
        await fetchTickets(false);
        return;
      }

      if (!response.ok) {
        let errorMessage =
          "Unable to cancel ticket at this time. Please try again.";
        try {
          const json: unknown = await response.json();
          if (
            json &&
            typeof json === "object" &&
            "error" in json &&
            typeof (json as { error: unknown }).error === "string"
          ) {
            errorMessage = (json as { error: string }).error;
          }
        } catch {
          // Fallback to default errorMessage
        }

        setActionError({
          ticketId: ticket.id,
          message: errorMessage,
        });
        return;
      }

      // Update only that ticket's local status to CANCELLED
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticket.id ? { ...t, status: "CANCELLED" } : t,
        ),
      );
    } catch {
      setActionError({
        ticketId: ticket.id,
        message:
          "Unable to connect to the server to cancel your ticket. Please check your connection and try again.",
      });
    } finally {
      setCancellingTicketId(null);
    }
  };

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=${encodeURIComponent("/tickets")}`);
      return;
    }

    void Promise.resolve().then(() => fetchTickets());

    return () => {
      if (activeFetchControllerRef.current) {
        activeFetchControllerRef.current.abort();
      }
    };
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
                onClick={() => fetchTickets(true)}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                Retry
              </button>
            </div>
          ) : tickets.length === 0 ? (
            <CustomerTicketsEmptyState />
          ) : (
            <div className="space-y-4">
              {tickets.map((ticket) => (
                <CustomerTicketCard
                  key={ticket.id}
                  ticket={ticket}
                  isCancelling={cancellingTicketId === ticket.id}
                  actionError={
                    actionError?.ticketId === ticket.id
                      ? actionError.message
                      : null
                  }
                  onCancel={handleCancelTicket}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
