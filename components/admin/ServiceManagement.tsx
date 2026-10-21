"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { formatCreationDate } from "@/lib/formatters/date";

export interface ServiceItem {
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

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
 * Handles listing existing service categories and creating new services.
 */
export function ServiceManagement({ organizationId }: ServiceManagementProps) {
  const router = useRouter();

  // Service management states
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [servicesOrgId, setServicesOrgId] = useState<string | null>(null);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [servicesRetryTrigger, setServicesRetryTrigger] = useState(0);

  // Service creation form states
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDescription, setNewServiceDescription] = useState("");
  const [isCreatingService, setIsCreatingService] = useState(false);
  const [serviceFormError, setServiceFormError] = useState<string | null>(null);
  const [serviceFormSuccess, setServiceFormSuccess] = useState<string | null>(null);

  // Concurrency & lifecycle refs
  const activeServiceControllerRef = useRef<AbortController | null>(null);
  const serviceFetchGenerationRef = useRef<number>(0);
  const activeServiceCreationRequestIdRef = useRef<number>(0);
  const currentOrgIdRef = useRef<string>(organizationId);
  const isCreatingServiceRef = useRef<boolean>(false);

  // Reset form inputs and errors when switching organizations
  const [prevOrgId, setPrevOrgId] = useState(organizationId);
  if (organizationId !== prevOrgId) {
    setPrevOrgId(organizationId);
    setNewServiceName("");
    setNewServiceDescription("");
    setServiceFormError(null);
    setServiceFormSuccess(null);
    setIsCreatingService(false);
    isCreatingServiceRef.current = false;
  }

  // Synchronize refs with organizationId prop
  useEffect(() => {
    currentOrgIdRef.current = organizationId;
    activeServiceCreationRequestIdRef.current += 1;
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

        const validated: ServiceItem[] = data.filter(
          (s): s is ServiceItem =>
            typeof s === "object" &&
            s !== null &&
            typeof (s as { id?: unknown }).id === "string" &&
            typeof (s as { name?: unknown }).name === "string" &&
            ((s as { description?: unknown }).description === null ||
              typeof (s as { description?: unknown }).description === "string") &&
            typeof (s as { organizationId?: unknown }).organizationId === "string" &&
            typeof (s as { createdAt?: unknown }).createdAt === "string" &&
            typeof (s as { updatedAt?: unknown }).updatedAt === "string",
        );

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
    setServicesRetryTrigger((prev) => prev + 1);
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingServiceRef.current) return;

    const trimmedName = newServiceName.trim();
    if (!trimmedName) {
      setServiceFormError("Service name is required.");
      return;
    }

    isCreatingServiceRef.current = true;
    const trimmedDesc = newServiceDescription.trim();
    const creationRequestId = ++activeServiceCreationRequestIdRef.current;
    setIsCreatingService(true);
    setServiceFormError(null);
    setServiceFormSuccess(null);

    const targetOrgId = organizationId;

    const payload: { name: string; description?: string } = {
      name: trimmedName,
    };
    if (trimmedDesc) {
      payload.description = trimmedDesc;
    }

    try {
      const res = await fetch(
        `/api/organizations/${encodeURIComponent(targetOrgId)}/services`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      // Verify the user is still on the same organization and this is still the active request
      if (
        currentOrgIdRef.current !== targetOrgId ||
        activeServiceCreationRequestIdRef.current !== creationRequestId
      ) {
        return;
      }

      if (res.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
        return;
      }

      if (res.status === 409) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setServiceFormError(
          data.error || "A service with this name already exists in this organization.",
        );
        return;
      }

      if (res.status === 400) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          details?: { fieldErrors?: { name?: string[]; description?: string[] } };
        };
        const message =
          data.details?.fieldErrors?.name?.[0] ||
          data.details?.fieldErrors?.description?.[0] ||
          data.error ||
          "Invalid service data.";
        setServiceFormError(message);
        return;
      }

      if (res.status === 403) {
        setServiceFormError("Only organization admins can create services.");
        return;
      }

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const newService: unknown = await res.json();

      if (
        currentOrgIdRef.current !== targetOrgId ||
        activeServiceCreationRequestIdRef.current !== creationRequestId
      ) {
        return;
      }

      // Cancel any in-flight GET requests and bump fetch generation so older GET responses cannot overwrite this creation
      serviceFetchGenerationRef.current += 1;
      if (activeServiceControllerRef.current) {
        activeServiceControllerRef.current.abort();
        activeServiceControllerRef.current = null;
      }

      if (
        typeof newService === "object" &&
        newService !== null &&
        typeof (newService as { id?: unknown }).id === "string" &&
        typeof (newService as { name?: unknown }).name === "string" &&
        ((newService as { description?: unknown }).description === null ||
          typeof (newService as { description?: unknown }).description === "string") &&
        typeof (newService as { organizationId?: unknown }).organizationId === "string" &&
        typeof (newService as { createdAt?: unknown }).createdAt === "string" &&
        typeof (newService as { updatedAt?: unknown }).updatedAt === "string"
      ) {
        const validService = newService as ServiceItem;
        setServices((prev) => {
          const updated = [...prev, validService];
          updated.sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true }),
          );
          return updated;
        });
        setNewServiceName("");
        setNewServiceDescription("");
        setServiceFormSuccess(`Service "${validService.name}" created successfully.`);
      } else {
        handleRetryServices();
        setNewServiceName("");
        setNewServiceDescription("");
        setServiceFormSuccess(`Service "${trimmedName}" created successfully.`);
      }
    } catch {
      if (
        currentOrgIdRef.current === targetOrgId &&
        activeServiceCreationRequestIdRef.current === creationRequestId
      ) {
        setServiceFormError(
          "Failed to create service due to a network error. Please try again.",
        );
      }
    } finally {
      if (
        currentOrgIdRef.current === targetOrgId &&
        activeServiceCreationRequestIdRef.current === creationRequestId
      ) {
        isCreatingServiceRef.current = false;
        setIsCreatingService(false);
      }
    }
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
          disabled={isServicesLoading || isCreatingService}
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
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Add Service Category
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Create a new service offering (e.g., &ldquo;General Inquiries&rdquo;, &ldquo;Technical Support&rdquo;, &ldquo;Consultation&rdquo;).
          </p>
        </div>

        <form onSubmit={handleCreateService} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="new-service-name"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                Service Name <span className="text-red-500">*</span>
              </label>
              <input
                id="new-service-name"
                type="text"
                value={newServiceName}
                onChange={(e) => {
                  setNewServiceName(e.target.value);
                  if (serviceFormError) setServiceFormError(null);
                  if (serviceFormSuccess) setServiceFormSuccess(null);
                }}
                placeholder="e.g., Account Services"
                disabled={isCreatingService}
                aria-invalid={Boolean(serviceFormError)}
                aria-describedby={
                  serviceFormError
                    ? "service-form-error"
                    : serviceFormSuccess
                    ? "service-form-success"
                    : undefined
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            <div>
              <label
                htmlFor="new-service-description"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                Description <span className="text-gray-400">(Optional)</span>
              </label>
              <input
                id="new-service-description"
                type="text"
                value={newServiceDescription}
                onChange={(e) => {
                  setNewServiceDescription(e.target.value);
                  if (serviceFormError) setServiceFormError(null);
                  if (serviceFormSuccess) setServiceFormSuccess(null);
                }}
                placeholder="e.g., Assistance with account verification"
                disabled={isCreatingService}
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          </div>

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={isCreatingService || !newServiceName.trim()}
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              {isCreatingService ? (
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
                "Create Service"
              )}
            </button>
          </div>

          {serviceFormError && (
            <div
              id="service-form-error"
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
              <span>{serviceFormError}</span>
            </div>
          )}

          {serviceFormSuccess && (
            <div
              id="service-form-success"
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
              <span>{serviceFormSuccess}</span>
            </div>
          )}
        </form>
      </div>

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
              <div
                key={service.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-gray-300 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-base font-semibold text-gray-900">
                      {service.name}
                    </h4>
                  </div>
                  {service.description ? (
                    <p className="text-xs text-gray-600 line-clamp-2">
                      {service.description}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 italic">
                      No description provided
                    </p>
                  )}
                  <span className="block font-mono text-xs text-gray-400">
                    ID: {service.id}
                  </span>
                </div>
                <div className="border-t border-gray-100 pt-3 text-xs text-gray-400">
                  {formatCreationDate(service.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
