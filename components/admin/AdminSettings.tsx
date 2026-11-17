"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { OrganizationItem } from "./OrganizationSelector";
import type { AdminSectionId } from "./AdminSidebar";

export interface AdminSettingsProps {
  organization: OrganizationItem;
  onNavigateSection: (sectionId: AdminSectionId) => void;
  onOrganizationUpdated?: (updated: OrganizationItem) => void;
  isOwner?: boolean;
}

export function AdminSettings({
  organization,
  onNavigateSection,
  onOrganizationUpdated,
  isOwner: isOwnerProp,
}: AdminSettingsProps) {
  const [apiIsOwner, setApiIsOwner] = useState<boolean | null>(null);
  const [updatedName, setUpdatedName] = useState<string | null>(null);
  const [prevOrgId, setPrevOrgId] = useState(organization.id);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(organization.name);
  const [isSaving, setIsSaving] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(
    null,
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Reset local state if active organization changes
  if (organization.id !== prevOrgId) {
    setPrevOrgId(organization.id);
    setUpdatedName(null);
    setApiIsOwner(null);
    setIsEditing(false);
    setEditName(organization.name);
    setClientError(null);
    setServerErrorMessage(null);
    setSuccessMessage(null);
  }

  const currentName = updatedName ?? organization.name;

  // Resolve ownership: explicit prop takes precedence, then organization object, then API fetch
  const isOwner =
    isOwnerProp !== undefined
      ? isOwnerProp
      : organization.isOwner !== undefined
        ? organization.isOwner
        : apiIsOwner === true;

  // Fetch organization details to determine ownership if not already supplied
  useEffect(() => {
    if (isOwnerProp !== undefined || organization.isOwner !== undefined) {
      return;
    }

    let active = true;
    const controller = new AbortController();

    fetch(`/api/organizations/${organization.id}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (active && typeof data?.isOwner === "boolean") {
          setApiIsOwner(data.isOwner);
        }
      })
      .catch(() => {
        // Ignore aborted or transient network errors
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [organization.id, isOwnerProp, organization.isOwner]);

  const handleStartEdit = () => {
    setEditName(currentName);
    setClientError(null);
    setServerErrorMessage(null);
    setSuccessMessage(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditName(currentName);
    setClientError(null);
    setServerErrorMessage(null);
    setIsEditing(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = editName.trim();
    if (!trimmed) {
      setClientError("Organization name is required");
      return;
    }

    if (trimmed.length > 100) {
      setClientError("Organization name must be 100 characters or fewer");
      return;
    }

    setIsSaving(true);
    setClientError(null);
    setServerErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/organizations/${organization.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!response.ok) {
        let msg = "Failed to update organization name";
        try {
          const errData = await response.json();
          if (errData && typeof errData.error === "string") {
            msg = errData.error;
          }
        } catch {
          // fallback
        }
        setServerErrorMessage(msg);
        return;
      }

      const updated = await response.json();
      const nextName = updated?.name ?? trimmed;

      setUpdatedName(nextName);
      setEditName(nextName);
      setIsEditing(false);
      setSuccessMessage("Organization name updated successfully.");

      if (onOrganizationUpdated) {
        onOrganizationUpdated({
          ...organization,
          name: nextName,
        });
      }
    } catch {
      setServerErrorMessage(
        "An unexpected network error occurred. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <h2 className="text-xl font-bold text-gray-900">Organization Settings</h2>
        <p className="mt-1 text-sm text-gray-600">
          Review organization identity, administrative status, and quick shortcuts.
        </p>
      </div>

      {/* Organization Details Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Organization Identity
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Core information associated with this organization workspace.
            </p>
          </div>
          {isOwner && !isEditing && (
            <button
              type="button"
              onClick={handleStartEdit}
              className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
            >
              <svg
                className="h-3.5 w-3.5 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                />
              </svg>
              Edit Details
            </button>
          )}
        </div>

        {successMessage && (
          <div
            role="status"
            className="mt-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800"
          >
            <span>{successMessage}</span>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="ml-3 text-emerald-600 hover:text-emerald-900 focus:outline-none"
              aria-label="Dismiss message"
            >
              ✕
            </button>
          </div>
        )}

        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
            <dt className="text-xs font-medium text-gray-500">
              Organization Name
            </dt>
            {isEditing ? (
              <form onSubmit={handleSave} className="mt-2 space-y-3">
                <div>
                  <label htmlFor="organization-name-input" className="sr-only">
                    Organization Name
                  </label>
                  <input
                    id="organization-name-input"
                    type="text"
                    value={editName}
                    onChange={(e) => {
                      setEditName(e.target.value);
                      if (clientError) setClientError(null);
                      if (serverErrorMessage) setServerErrorMessage(null);
                    }}
                    disabled={isSaving}
                    placeholder="Organization name"
                    autoFocus
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50"
                  />
                  {clientError && (
                    <p className="mt-1 text-xs text-red-600" role="alert">
                      {clientError}
                    </p>
                  )}
                  {serverErrorMessage && (
                    <p className="mt-1 text-xs text-red-600" role="alert">
                      {serverErrorMessage}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50"
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={isSaving}
                    className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <dd className="mt-1 text-sm font-semibold text-gray-900">
                {currentName}
              </dd>
            )}
          </div>

          <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
            <div className="flex items-center justify-between">
              <dt className="text-xs font-medium text-gray-500">Public Slug</dt>
              <span className="rounded bg-gray-200/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-600">
                Read-only
              </span>
            </div>
            <dd className="mt-1 text-sm font-mono font-semibold text-gray-900">
              @{organization.slug}
            </dd>
          </div>

          <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
            <div className="flex items-center justify-between">
              <dt className="text-xs font-medium text-gray-500">Identifier</dt>
              <span className="rounded bg-gray-200/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-600">
                Read-only
              </span>
            </div>
            <dd
              className="mt-1 text-xs font-mono text-gray-700 truncate"
              title={organization.id}
            >
              {organization.id}
            </dd>
          </div>
        </dl>
      </div>

      {/* Quick Navigation Hub */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900">Quick Navigation</h3>
        <p className="mt-1 text-xs text-gray-500">
          Jump directly to key administrative sections for this organization.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => onNavigateSection("overview")}
            className="flex flex-col items-start rounded-lg border border-gray-200 p-4 text-left transition-all hover:border-gray-900 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
          >
            <span className="text-sm font-semibold text-gray-900">Overview</span>
            <span className="mt-1 text-xs text-gray-500">
              Live queue metrics & status
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateSection("services-queues")}
            className="flex flex-col items-start rounded-lg border border-gray-200 p-4 text-left transition-all hover:border-gray-900 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
          >
            <span className="text-sm font-semibold text-gray-900">Services & Queues</span>
            <span className="mt-1 text-xs text-gray-500">
              Configure queues and quotas
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateSection("counters")}
            className="flex flex-col items-start rounded-lg border border-gray-200 p-4 text-left transition-all hover:border-gray-900 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
          >
            <span className="text-sm font-semibold text-gray-900">Counters</span>
            <span className="mt-1 text-xs text-gray-500">
              Manage service desks & windows
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateSection("operating-hours")}
            className="flex flex-col items-start rounded-lg border border-gray-200 p-4 text-left transition-all hover:border-gray-900 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
          >
            <span className="text-sm font-semibold text-gray-900">Operating Hours</span>
            <span className="mt-1 text-xs text-gray-500">
              Weekly schedule & closures
            </span>
          </button>
        </div>
      </div>

      {/* External Portals & Links */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900">Connected Consoles & Links</h3>
        <p className="mt-1 text-xs text-gray-500">
          Open related QueueFlow customer and operator surfaces.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={`/organizations/${organization.id}`}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
          >
            View Customer Catalog
          </Link>

          <Link
            href="/staff"
            className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
          >
            Open Staff Console
          </Link>

          <Link
            href="/organizations"
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
          >
            Browse Organizations
          </Link>
        </div>
      </div>
    </div>
  );
}
