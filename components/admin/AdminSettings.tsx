"use client";

import Link from "next/link";
import type { OrganizationItem } from "./OrganizationSelector";
import type { AdminSectionId } from "./AdminSidebar";

export interface AdminSettingsProps {
  organization: OrganizationItem;
  onNavigateSection: (sectionId: AdminSectionId) => void;
}

export function AdminSettings({
  organization,
  onNavigateSection,
}: AdminSettingsProps) {
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
        <h3 className="text-base font-semibold text-gray-900">Organization Identity</h3>
        <p className="mt-1 text-xs text-gray-500">
          Core information associated with this organization workspace.
        </p>

        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
            <dt className="text-xs font-medium text-gray-500">Organization Name</dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">
              {organization.name}
            </dd>
          </div>

          <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
            <dt className="text-xs font-medium text-gray-500">Public Slug</dt>
            <dd className="mt-1 text-sm font-mono font-semibold text-gray-900">
              @{organization.slug}
            </dd>
          </div>

          <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
            <dt className="text-xs font-medium text-gray-500">Identifier</dt>
            <dd className="mt-1 text-xs font-mono text-gray-700 truncate" title={organization.id}>
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
