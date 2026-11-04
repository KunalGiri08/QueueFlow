"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ServiceItem } from "./types";

export interface EditServiceDialogProps {
  service: ServiceItem | null;
  organizationId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedService: ServiceItem) => void;
}

export function EditServiceDialog({
  service,
  organizationId,
  isOpen,
  onClose,
  onSuccess,
}: EditServiceDialogProps) {
  const router = useRouter();

  const [editName, setEditName] = useState(service?.name ?? "");
  const [editDescription, setEditDescription] = useState(
    service?.description ?? "",
  );
  const [editCutoffMinutes, setEditCutoffMinutes] = useState(
    service?.admissionCutoffMinutes != null
      ? String(service.admissionCutoffMinutes)
      : "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const activeEditRequestIdRef = useRef<number>(0);
  const currentOrgIdRef = useRef<string>(organizationId);
  const isSavingRef = useRef<boolean>(false);

  // Synchronously update form state when editing target changes
  const [prevServiceId, setPrevServiceId] = useState(service?.id ?? null);
  if (service && service.id !== prevServiceId) {
    setPrevServiceId(service.id);
    setEditName(service.name);
    setEditDescription(service.description ?? "");
    setEditCutoffMinutes(
      service.admissionCutoffMinutes != null
        ? String(service.admissionCutoffMinutes)
        : "",
    );
    setEditError(null);
    setIsSaving(false);
  }

  useEffect(() => {
    isSavingRef.current = false;
    currentOrgIdRef.current = organizationId;
    activeEditRequestIdRef.current += 1;
  }, [organizationId]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSaving) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving, onClose]);

  if (!isOpen || !service) return null;

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingRef.current) return;

    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditError("Service name is required.");
      return;
    }

    let parsedCutoff: number | null = null;
    if (editCutoffMinutes.trim() !== "") {
      const parsed = Number(editCutoffMinutes.trim());
      if (!Number.isInteger(parsed)) {
        setEditError("Admission cutoff minutes must be an integer.");
        return;
      }
      if (parsed < 0) {
        setEditError("Admission cutoff minutes cannot be negative.");
        return;
      }
      if (parsed > 480) {
        setEditError("Admission cutoff minutes cannot exceed 480 (8 hours).");
        return;
      }
      parsedCutoff = parsed;
    }

    isSavingRef.current = true;
    const editRequestId = ++activeEditRequestIdRef.current;
    setIsSaving(true);
    setEditError(null);

    const targetOrgId = organizationId;
    const targetServiceId = service.id;
    const trimmedDesc = editDescription.trim();

    try {
      const payload: {
        name: string;
        description: string;
        admissionCutoffMinutes: number | null;
      } = {
        name: trimmedName,
        description: trimmedDesc,
        admissionCutoffMinutes: parsedCutoff,
      };

      const res = await fetch(
        `/api/organizations/${encodeURIComponent(targetOrgId)}/services/${encodeURIComponent(targetServiceId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (
        currentOrgIdRef.current !== targetOrgId ||
        activeEditRequestIdRef.current !== editRequestId
      ) {
        return;
      }

      if (res.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
        return;
      }

      if (res.status === 409) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setEditError(
          data.error ||
            "A service with this name already exists in this organization.",
        );
        return;
      }

      if (res.status === 400) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          details?: {
            fieldErrors?: {
              name?: string[];
              description?: string[];
              admissionCutoffMinutes?: string[];
            };
          };
        };
        const message =
          data.details?.fieldErrors?.name?.[0] ||
          data.details?.fieldErrors?.admissionCutoffMinutes?.[0] ||
          data.details?.fieldErrors?.description?.[0] ||
          data.error ||
          "Invalid service parameters.";
        setEditError(message);
        return;
      }

      if (res.status === 403) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setEditError(
          data.error || "Only organization admins can update services.",
        );
        return;
      }

      if (res.status === 404) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setEditError(
          data.error || "Service not found in this organization.",
        );
        return;
      }

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const updatedService: unknown = await res.json();

      if (
        currentOrgIdRef.current !== targetOrgId ||
        activeEditRequestIdRef.current !== editRequestId
      ) {
        return;
      }

      if (
        typeof updatedService === "object" &&
        updatedService !== null &&
        typeof (updatedService as { id?: unknown }).id === "string" &&
        typeof (updatedService as { name?: unknown }).name === "string" &&
        ((updatedService as { description?: unknown }).description === null ||
          typeof (updatedService as { description?: unknown }).description ===
            "string") &&
        typeof (updatedService as { organizationId?: unknown })
          .organizationId === "string" &&
        typeof (updatedService as { createdAt?: unknown }).createdAt ===
          "string" &&
        typeof (updatedService as { updatedAt?: unknown }).updatedAt === "string"
      ) {
        const rawUpdated = updatedService as ServiceItem;
        const validUpdated: ServiceItem = {
          ...rawUpdated,
          isActive:
            typeof (rawUpdated as { isActive?: unknown }).isActive === "boolean"
              ? (rawUpdated as { isActive: boolean }).isActive
              : service.isActive,
          admissionCutoffMinutes:
            typeof rawUpdated.admissionCutoffMinutes === "number"
              ? rawUpdated.admissionCutoffMinutes
              : null,
        };

        onSuccess(validUpdated);
      } else {
        // Fallback with current form values
        onSuccess({
          ...service,
          name: trimmedName,
          description: trimmedDesc || null,
          admissionCutoffMinutes: parsedCutoff,
        });
      }
    } catch {
      if (
        currentOrgIdRef.current === targetOrgId &&
        activeEditRequestIdRef.current === editRequestId
      ) {
        setEditError(
          "Failed to update service due to a network error. Please try again.",
        );
      }
    } finally {
      if (
        currentOrgIdRef.current === targetOrgId &&
        activeEditRequestIdRef.current === editRequestId
      ) {
        isSavingRef.current = false;
        setIsSaving(false);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-service-dialog-title"
        className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl transition-all space-y-4"
      >
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h3
              id="edit-service-dialog-title"
              className="text-base font-bold text-gray-900"
            >
              Edit Service
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Update service details and admission cutoff settings for &ldquo;
              {service.name}&rdquo;.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close edit service dialog"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSaveEdit} noValidate className="space-y-4">
          <div>
            <label
              htmlFor="edit-service-name"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              Service Name <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-service-name"
              type="text"
              value={editName}
              onChange={(e) => {
                setEditName(e.target.value);
                if (editError) setEditError(null);
              }}
              placeholder="e.g., Consultation"
              disabled={isSaving}
              aria-invalid={Boolean(editError)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          <div>
            <label
              htmlFor="edit-service-description"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              Description{" "}
              <span className="font-normal text-gray-400">(Optional)</span>
            </label>
            <input
              id="edit-service-description"
              type="text"
              value={editDescription}
              onChange={(e) => {
                setEditDescription(e.target.value);
                if (editError) setEditError(null);
              }}
              placeholder="e.g., Walk-in consultations and general inquiries"
              disabled={isSaving}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          <div>
            <label
              htmlFor="edit-service-cutoff"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              Admission Cutoff (Minutes){" "}
              <span className="font-normal text-gray-400">(Optional)</span>
            </label>
            <input
              id="edit-service-cutoff"
              type="number"
              min="0"
              max="480"
              value={editCutoffMinutes}
              onChange={(e) => {
                setEditCutoffMinutes(e.target.value);
                if (editError) setEditError(null);
              }}
              placeholder="Unlimited / No cutoff"
              disabled={isSaving}
              aria-invalid={Boolean(editError)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          <p className="text-xs text-gray-500">
            Specify minutes before daily schedule closing when ticket admission
            stops. Leave empty for no cutoff (unlimited admission until closing).
            Maximum 480 minutes (8 hours).
          </p>

          {editError && (
            <div
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
              <span>{editError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !editName.trim()}
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-xs sm:text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              {isSaving ? (
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
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

