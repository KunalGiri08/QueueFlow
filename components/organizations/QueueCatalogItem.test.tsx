// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueueCatalogItem } from "./QueueCatalogItem";
import type { PublicQueue, QueueAvailabilityData } from "./types";

describe("components/organizations/QueueCatalogItem", () => {
  const mockQueue: PublicQueue = {
    id: "queue-1",
    name: "General Consultation Line",
    isActive: true,
  };

  const baseAvailabilityData: QueueAvailabilityData = {
    id: "queue-1",
    name: "General Consultation Line",
    isActive: true,
    currentlyServing: 42,
    waitingCount: 5,
    estimatedWaitMinutes: 15,
    maxWaitingTickets: 20,
    maxDailyTickets: 100,
    dailyCount: 30,
    isWaitingCapacityFull: false,
    isDailyQuotaReached: false,
    isJoinable: true,
    unavailabilityReason: null,
    unavailabilityCode: null,
    organizationStatus: {
      isOpen: true,
      reason: "OPEN",
      message: null,
    },
    admissionStatus: {
      isAdmitted: true,
      reason: "ADMITTED",
      message: null,
      cutoffMinutes: 30,
      effectiveCutoffTime: "16:30",
    },
  };

  it("renders queue name and calls onJoinQueue when Join Queue is clicked", () => {
    const handleJoin = vi.fn();
    const handleRetry = vi.fn();

    render(
      <QueueCatalogItem
        queue={mockQueue}
        availability={{
          data: baseAvailabilityData,
          isLoading: false,
          error: null,
        }}
        isSubmitting={false}
        isAnyQueueSubmitting={false}
        queueError={null}
        onJoinQueue={handleJoin}
        onRetryAvailability={handleRetry}
      />,
    );

    expect(screen.getByText("General Consultation Line")).toBeDefined();
    expect(screen.getByText("Available")).toBeDefined();
    expect(screen.getByText("Waiting: 5 / 20")).toBeDefined();
    expect(screen.getByText("Est. wait: ~15 min")).toBeDefined();
    expect(screen.getByText("#42")).toBeDefined();
    expect(screen.getByText("Daily: 30 / 100")).toBeDefined();

    const joinBtn = screen.getByRole("button", { name: "Join General Consultation Line" });
    fireEvent.click(joinBtn);
    expect(handleJoin).toHaveBeenCalledWith("queue-1");
  });

  it("renders 'No wait' when waiting count is 0 and wait minutes is null", () => {
    render(
      <QueueCatalogItem
        queue={mockQueue}
        availability={{
          data: {
            ...baseAvailabilityData,
            waitingCount: 0,
            estimatedWaitMinutes: null,
          },
          isLoading: false,
          error: null,
        }}
        isSubmitting={false}
        isAnyQueueSubmitting={false}
        queueError={null}
        onJoinQueue={vi.fn()}
        onRetryAvailability={vi.fn()}
      />,
    );

    expect(screen.getByText("No wait")).toBeDefined();
  });

  it("disables button and shows 'Queue Unavailable' with reason banner when capacity is full", () => {
    const fullData: QueueAvailabilityData = {
      ...baseAvailabilityData,
      isJoinable: false,
      isWaitingCapacityFull: true,
      unavailabilityReason: "Maximum waiting capacity reached (20/20)",
      unavailabilityCode: "QUEUE_CAPACITY_REACHED",
    };

    render(
      <QueueCatalogItem
        queue={mockQueue}
        availability={{
          data: fullData,
          isLoading: false,
          error: null,
        }}
        isSubmitting={false}
        isAnyQueueSubmitting={false}
        queueError={null}
        onJoinQueue={vi.fn()}
        onRetryAvailability={vi.fn()}
      />,
    );

    expect(screen.getByText("Queue Full")).toBeDefined();
    const btn = screen.getByRole("button", { name: /Currently unavailable/ });
    expect(btn.getAttribute("disabled")).not.toBeNull();
    expect(btn.textContent).toBe("Queue Unavailable");
    expect(screen.getByTestId("queue-unavailable-banner-queue-1")).toBeDefined();
    expect(
      screen.getByText("Maximum waiting capacity reached (20/20)"),
    ).toBeDefined();
  });

  it("renders 'Daily Quota Reached' badge when daily limit is hit", () => {
    render(
      <QueueCatalogItem
        queue={mockQueue}
        availability={{
          data: {
            ...baseAvailabilityData,
            isJoinable: false,
            isDailyQuotaReached: true,
            unavailabilityReason: "Daily ticket limit reached (100/100)",
          },
          isLoading: false,
          error: null,
        }}
        isSubmitting={false}
        isAnyQueueSubmitting={false}
        queueError={null}
        onJoinQueue={vi.fn()}
        onRetryAvailability={vi.fn()}
      />,
    );

    expect(screen.getByText("Daily Quota Reached")).toBeDefined();
  });

  it("renders 'Admission Closed' badge and cutoff note when cutoff time passed", () => {
    render(
      <QueueCatalogItem
        queue={mockQueue}
        availability={{
          data: {
            ...baseAvailabilityData,
            isJoinable: false,
            admissionStatus: {
              isAdmitted: false,
              reason: "ADMISSION_CUTOFF_REACHED",
              message: "Admission closed for today",
              cutoffMinutes: 30,
              effectiveCutoffTime: "16:30",
            },
          },
          isLoading: false,
          error: null,
        }}
        isSubmitting={false}
        isAnyQueueSubmitting={false}
        queueError={null}
        onJoinQueue={vi.fn()}
        onRetryAvailability={vi.fn()}
      />,
    );

    expect(screen.getByText("Admission Closed")).toBeDefined();
    expect(
      screen.getByText("Admission closed for today at 16:30"),
    ).toBeDefined();
  });

  it("renders 'Closed' badge when organization status is closed", () => {
    render(
      <QueueCatalogItem
        queue={mockQueue}
        availability={{
          data: {
            ...baseAvailabilityData,
            isJoinable: false,
            organizationStatus: {
              isOpen: false,
              reason: "ORGANIZATION_CLOSED",
              message: "Closed for the day",
            },
          },
          isLoading: false,
          error: null,
        }}
        isSubmitting={false}
        isAnyQueueSubmitting={false}
        queueError={null}
        onJoinQueue={vi.fn()}
        onRetryAvailability={vi.fn()}
      />,
    );

    expect(screen.getByText("Closed")).toBeDefined();
  });

  it("renders 'Checking...' pulse indicator when availability is loading", () => {
    render(
      <QueueCatalogItem
        queue={mockQueue}
        availability={{
          data: null,
          isLoading: true,
          error: null,
        }}
        isSubmitting={false}
        isAnyQueueSubmitting={false}
        queueError={null}
        onJoinQueue={vi.fn()}
        onRetryAvailability={vi.fn()}
      />,
    );

    expect(screen.getByText("Checking...")).toBeDefined();
    expect(screen.getByText("Checking queue availability...")).toBeDefined();
  });

  it("renders error state with retry button on availability fetch failure", () => {
    const handleRetry = vi.fn();

    render(
      <QueueCatalogItem
        queue={mockQueue}
        availability={{
          data: null,
          isLoading: false,
          error: "Unable to load availability",
        }}
        isSubmitting={false}
        isAnyQueueSubmitting={false}
        queueError={null}
        onJoinQueue={vi.fn()}
        onRetryAvailability={handleRetry}
      />,
    );

    expect(
      screen.getByText("Availability information unavailable"),
    ).toBeDefined();
    const retryBtn = screen.getByRole("button", { name: "Retry" });
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledWith("queue-1");
  });

  it("renders submitting spinner when isSubmitting is true", () => {
    render(
      <QueueCatalogItem
        queue={mockQueue}
        availability={{
          data: baseAvailabilityData,
          isLoading: false,
          error: null,
        }}
        isSubmitting={true}
        isAnyQueueSubmitting={true}
        queueError={null}
        onJoinQueue={vi.fn()}
        onRetryAvailability={vi.fn()}
      />,
    );

    expect(screen.getByText("Joining...")).toBeDefined();
  });

  it("renders ticket submission error with link to My Tickets when ACTIVE_TICKET_EXISTS", () => {
    render(
      <QueueCatalogItem
        queue={mockQueue}
        availability={{
          data: baseAvailabilityData,
          isLoading: false,
          error: null,
        }}
        isSubmitting={false}
        isAnyQueueSubmitting={false}
        queueError={{
          queueId: "queue-1",
          message: "You already have an active ticket in this queue.",
          code: "ACTIVE_TICKET_EXISTS",
        }}
        onJoinQueue={vi.fn()}
        onRetryAvailability={vi.fn()}
      />,
    );

    expect(
      screen.getByText("You already have an active ticket in this queue."),
    ).toBeDefined();
    const link = screen.getByRole("link", {
      name: "Track your ticket in My Tickets →",
    });
    expect(link.getAttribute("href")).toBe("/tickets");
  });
});
