"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ServiceItem } from "./services/types";
import { ServiceCard } from "./services/ServiceCard";
import { CreateServiceCard } from "./services/CreateServiceCard";
import { EditServiceDialog } from "./services/EditServiceDialog";

// Re-export types for backward compatibility with external callers and tests
export type { ServiceItem };

export interface ServiceManagementProps {
  organizationId: string;
}

function ServicesSkeleton() {
  return (
    <div
      aria-label="Loading service categories"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pulse"
    >
      {Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="h-5 w-32 rounded bg-gray-200" />
            <div className="h-3 w-16 rounded bg-gray-100 font-mono" />
          </div>
          <div className="h-3 w-48 rounded bg-gray-100" />
          <div className="h-3 w-28 rounded bg-gray-100 pt-2" />
        </div>
      ))}
    </div>
  );
}

/**
 * Service Management module for organization administrators.
 * Handles listing existing service categories, toggling active status,
 * and coordinating creation and editing workflows.
 */
export function ServiceManagement({ organizationId }: ServiceManagementProps) {
  const router = useRouter();

  // Service management listing state
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [servicesOrgId, setServicesOrgId] = useState<string | null>(null);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [servicesRetryTrigger, setServicesRetryTrigger] = useState(0);

  // Service activation/deactivation operational states
  const [updatingServiceId, setUpdatingServiceId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Service editing modal state
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);

  // Concurrency & lifecycle refs
  const activeServiceControllerRef = useRef<AbortController | null>(null);
  const serviceFetchGenerationRef = useRef<number>(0);
  const activeActionRequestIdRef = useRef<number>(0);
  const currentOrgIdRef = useRef<string>(organizationId);

  // Reset form inputs and errors when switching organizations
  const [prevOrgId, setPrevOrgId] = useState(organizationId);
  if (organizationId !== prevOrgId) {
    setPrevOrgId(organizationId);
    setUpdatingServiceId(null);
    setActionError(null);
    setActionSuccess(null);
    setEditingService(null);
  }

  // Synchronize refs with organizationId prop
  useEffect(() => {
    currentOrgIdRef.current = organizationId;
    activeActionRequestIdRef.current += 1;
  }, [organizationId]);

  // Service fetching effect: triggers when organizationId changes or retry is clicked
  useEffect(() => {
    if (activeServiceControllerRef.current) {
      activeServiceControllerRef.current.abort();
    }

    let isCurrent = true;
    const fetchGen = ++serviceFetchGenerationRef.current;
    const controller = new AbortController();
    activeServiceControllerRef.current = controller;

    fetch(`/api/organizations/${encodeURIComponent(organizationId)}/services`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!isCurrent || serviceFetchGenerationRef.current !== fetchGen) return;

        if (res.status === 401) {
          router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
          return;
        }

        if (!res.ok) {
          throw new Error(`Failed to load services (status ${res.status})`);
        }

        const data: unknown = await res.json();
        if (!Array.isArray(data)) {
          throw new Error("Malformed services response");
        }

        const validated: ServiceItem[] = [];
        for (const s of data) {
          if (
            typeof s === "object" &&
            s !== null &&
            typeof (s as { id?: unknown }).id === "string" &&
            typeof (s as { name?: unknown }).name === "string" &&
            ((s as { description?: unknown }).description === null ||
              typeof (s as { description?: unknown }).description === "string") &&
            typeof (s as { organizationId?: unknown }).organizationId === "string" &&
            typeof (s as { createdAt?: unknown }).createdAt === "string" &&
            typeof (s as { updatedAt?: unknown }).updatedAt === "string"
          ) {
            validated.push({
              id: (s as { id: string }).id,
              name: (s as { name: string }).name,
              description:
                (s as { description: string | null }).description ?? null,
              organizationId: (s as { organizationId: string }).organizationId,
              isActive:
                typeof (s as { isActive?: unknown }).isActive === "boolean"
                  ? (s as { isActive: boolean }).isActive
                  : true,
              createdAt: (s as { createdAt: string }).createdAt,
              updatedAt: (s as { updatedAt: string }).updatedAt,
              admissionCutoffMinutes:
                typeof (s as { admissionCutoffMinutes?: unknown })
                  .admissionCutoffMinutes === "number"
                  ? (s as { admissionCutoffMinutes: number })
                      .admissionCutoffMinutes
                  : null,
            });
          }
        }

        validated.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true }),
        );

        if (!isCurrent || serviceFetchGenerationRef.current !== fetchGen) return;

        setServices(validated);
        setServicesOrgId(organizationId);
        setServicesError(null);
      })
      .catch((err: unknown) => {
        if (!isCurrent || serviceFetchGenerationRef.current !== fetchGen) return;
        if (
          (err instanceof Error && err.name === "AbortError") ||
          (typeof err === "object" &&
            err !== null &&
            "name" in err &&
            (err as { name: unknown }).name === "AbortError") ||
          controller.signal.aborted
        ) {
          return;
        }
        setServicesOrgId(organizationId);
        setServicesError(
          "Unable to load services at this time. Please try again.",
        );
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [organizationId, servicesRetryTrigger, router]);

  const handleRetryServices = () => {
    setServicesOrgId(null);
    setServicesError(null);
    setActionError(null);
    setActionSuccess(null);
    setServicesRetryTrigger((prev) => prev + 1);
  };

  const handleToggleServiceStatus = async (service: ServiceItem) => {
    if (updatingServiceId || isServicesLoading || Boolean(editingService)) return;

    setActionError(null);
    setActionSuccess(null);
    setUpdatingServiceId(service.id);

    const actionRequestId = ++activeActionRequestIdRef.current;
    const targetOrgId = organizationId;
    const targetIsActive = !service.isActive;

    try {
      const res = await fetch(
        `/api/organizations/${encodeURIComponent(targetOrgId)}/services/${encodeURIComponent(service.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ isActive: targetIsActive }),
        },
      );

      if (
        currentOrgIdRef.current !== targetOrgId ||
        activeActionRequestIdRef.current !== actionRequestId
      ) {
        return;
      }

      if (res.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
        return;
      }

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(
          data.error ||
            `Failed to ${targetIsActive ? "activate" : "deactivate"} service "${service.name}".`,
        );
        return;
      }

      const updated: unknown = await res.json();

      if (
        currentOrgIdRef.current !== targetOrgId ||
        activeActionRequestIdRef.current !== actionRequestId
      ) {
        return;
      }

      if (
        typeof updated === "object" &&
        updated !== null &&
        typeof (updated as { id?: unknown }).id === "string" &&
        typeof (updated as { isActive?: unknown }).isActive === "boolean"
      ) {
        const validUpdated = updated as ServiceItem;
        setServices((prev) =>
          prev.map((s) =>
            s.id === service.id ? { ...s, isActive: validUpdated.isActive } : s,
          ),
        );
        setActionSuccess(
          `Service "${service.name}" ${
            validUpdated.isActive ? "activated" : "deactivated"
          } successfully.`,
        );
      } else {
        setServices((prev) =>
          prev.map((s) =>
            s.id === service.id ? { ...s, isActive: targetIsActive } : s,
          ),
        );
        setActionSuccess(
          `Service "${service.name}" ${
            targetIsActive ? "activated" : "deactivated"
          } successfully.`,
        );
      }
    } catch {
      if (
        currentOrgIdRef.current === targetOrgId &&
        activeActionRequestIdRef.current === actionRequestId
      ) {
        setActionError(
          `Failed to ${targetIsActive ? "activate" : "deactivate"} service due to a network error. Please try again.`,
        );
      }
    } finally {
      if (activeActionRequestIdRef.current === actionRequestId) {
        setUpdatingServiceId(null);
      }
    }
  };

  const handleServiceCreated = (newService: ServiceItem) => {
    // Cancel any in-flight GET requests and bump fetch generation so older GET responses cannot overwrite this creation
    serviceFetchGenerationRef.current += 1;
    if (activeServiceControllerRef.current) {
      activeServiceControllerRef.current.abort();
      activeServiceControllerRef.current = null;
    }

    setServices((prev) => {
      const updated = [...prev, newService];
      updated.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }),
      );
      return updated;
    });
  };

  const handleCreationFallback = () => {
    handleRetryServices();
  };

  const handleEditSuccess = (updatedService: ServiceItem) => {
    setServices((prev) => {
      const updated = prev.map((s) =>
        s.id === updatedService.id ? updatedService : s,
      );
      updated.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }),
      );
      return updated;
    });
    setEditingService(null);
    setActionSuccess(`Service "${updatedService.name}" updated successfully.`);
  };

  const isServicesLoading = Boolean(servicesOrgId !== organizationId);
  const displayedServices = servicesOrgId === organizationId ? services : [];

  return (
    <div className="space-y-6">
      {/* Service Section Header & Controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-gray-900">
              Service Categories
            </h2>
            {!isServicesLoading &&
              servicesOrgId === organizationId &&
              !servicesError && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                  {displayedServices.length}{" "}
                  {displayedServices.length === 1 ? "service" : "services"}
                </span>
              )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Configure customer service categories offered by your organization for walk-ins and appointments.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRetryServices}
          disabled={isServicesLoading || Boolean(editingService)}
          className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50"
          aria-label="Refresh service categories"
        >
          <svg
            className={`h-3.5 w-3.5 text-gray-500 ${
              isServicesLoading ? "animate-spin" : ""
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

      {/* Create Service Card */}
      <CreateServiceCard
        organizationId={organizationId}
        isDisabled={isServicesLoading || Boolean(editingService)}
        onServiceCreated={handleServiceCreated}
        onCreationFallback={handleCreationFallback}
      />

      {/* Global Service Action Feedback Alerts */}
      {actionError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs sm:text-sm font-medium text-red-800 shadow-sm flex items-start justify-between gap-3"
        >
          <div className="flex items-center gap-2">
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
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-600 hover:text-red-900 text-xs font-semibold shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {actionSuccess && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs sm:text-sm font-medium text-emerald-800 shadow-sm flex items-start justify-between gap-3"
        >
          <div className="flex items-center gap-2">
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
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-600 hover:text-emerald-900 text-xs font-semibold shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Services List State Container */}
      <div>
        {isServicesLoading ? (
          <ServicesSkeleton />
        ) : servicesError ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50/70 p-6 text-center text-red-800 shadow-sm"
          >
            <p className="text-sm font-medium">{servicesError}</p>
            <button
              type="button"
              onClick={handleRetryServices}
              className="mt-3 inline-flex items-center justify-center rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              Retry Loading Services
            </button>
          </div>
        ) : displayedServices.length === 0 ? (
          /* Empty State: No services configured yet */
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
                  d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z"
                />
              </svg>
            </div>
            <h4 className="mt-3 text-sm font-semibold text-gray-900">
              No Service Categories Configured
            </h4>
            <p className="mt-1 text-xs text-gray-500 max-w-sm mx-auto">
              Add your first service category above. Queues and appointments require at least one service category.
            </p>
          </div>
        ) : (
          /* Populated State: Grid of Services */
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayedServices.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                isUpdating={updatingServiceId === service.id}
                isAnyUpdating={Boolean(updatingServiceId)}
                isDisabled={isServicesLoading || Boolean(editingService)}
                onEdit={(s) => setEditingService(s)}
                onToggleStatus={handleToggleServiceStatus}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Service Modal Dialog */}
      <EditServiceDialog
        service={editingService}
        organizationId={organizationId}
        isOpen={Boolean(editingService)}
        onClose={() => setEditingService(null)}
        onSuccess={handleEditSuccess}
      />
    </div>
  );
}
