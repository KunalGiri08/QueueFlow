"use client";

import { useState } from "react";

export type AdminSectionId =
  | "overview"
  | "services-queues"
  | "counters"
  | "operating-hours"
  | "staff"
  | "settings";

export interface AdminSectionItem {
  id: AdminSectionId;
  label: string;
  description: string;
  icon: (props: { className?: string }) => React.ReactNode;
}

function OverviewIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.75"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
      />
    </svg>
  );
}

function ServicesQueuesIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.75"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z"
      />
    </svg>
  );
}

function CountersIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.75"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72m-13.5 8.65h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z"
      />
    </svg>
  );
}

function OperatingHoursIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.75"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function StaffIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.75"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
      />
    </svg>
  );
}

function SettingsIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.75"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}

export const ADMIN_SECTIONS: AdminSectionItem[] = [
  {
    id: "overview",
    label: "Overview",
    description: "Organization details and live analytics",
    icon: OverviewIcon,
  },
  {
    id: "services-queues",
    label: "Services & Queues",
    description: "Service categories and queue management",
    icon: ServicesQueuesIcon,
  },
  {
    id: "counters",
    label: "Counters",
    description: "Physical service counter management",
    icon: CountersIcon,
  },
  {
    id: "operating-hours",
    label: "Operating Hours",
    description: "Weekly schedules and exceptional closures",
    icon: OperatingHoursIcon,
  },
  {
    id: "staff",
    label: "Staff & Access",
    description: "Staff operators and counter assignments",
    icon: StaffIcon,
  },
  {
    id: "settings",
    label: "Settings",
    description: "Organization metadata and shortcuts",
    icon: SettingsIcon,
  },
];

export interface AdminSidebarProps {
  activeSection: AdminSectionId;
  onSelectSection: (sectionId: AdminSectionId) => void;
}

export function AdminSidebar({
  activeSection,
  onSelectSection,
}: AdminSidebarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const activeItem =
    ADMIN_SECTIONS.find((s) => s.id === activeSection) ?? ADMIN_SECTIONS[0];
  const ActiveIcon = activeItem.icon;

  return (
    <>
      {/* Mobile Collapsible Navigation (screens < lg) */}
      <div className="block lg:hidden w-full">
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-900 shrink-0">
                <ActiveIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="block text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Active Section
                </span>
                <span className="block text-sm font-bold text-gray-900 truncate">
                  {activeItem.label}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-expanded={isMobileMenuOpen}
              aria-controls="admin-mobile-nav"
              aria-label="Toggle navigation menu"
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
            >
              <span>{isMobileMenuOpen ? "Close Menu" : "Switch Section"}</span>
              <svg
                className={`ml-1.5 h-3.5 w-3.5 transition-transform duration-200 ${
                  isMobileMenuOpen ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m19.5 8.25-7.5 7.5-7.5-7.5"
                />
              </svg>
            </button>
          </div>

          {isMobileMenuOpen && (
            <div
              id="admin-mobile-nav"
              className="mt-3 pt-3 border-t border-gray-100 space-y-1"
            >
              {ADMIN_SECTIONS.map((section) => {
                const isActive = activeSection === section.id;
                const Icon = section.icon;

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => {
                      onSelectSection(section.id);
                      setIsMobileMenuOpen(false);
                    }}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-gray-900 text-white font-semibold"
                        : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isActive ? "text-white" : "text-gray-500"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="block truncate">{section.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Desktop Persistent Left Sidebar (screens >= lg) */}
      <aside
        aria-label="Admin Navigation"
        className="hidden lg:block w-64 shrink-0 rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
      >
        <div className="px-3 py-2 border-b border-gray-100 mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Admin Sections
          </p>
        </div>

        <nav
          role="tablist"
          aria-orientation="vertical"
          aria-label="Admin dashboard sections"
          className="space-y-1"
        >
          {ADMIN_SECTIONS.map((section) => {
            const isActive = activeSection === section.id;
            const Icon = section.icon;

            return (
              <button
                key={section.id}
                type="button"
                role="tab"
                id={`admin-tab-${section.id}`}
                aria-controls={`admin-panel-${section.id}`}
                aria-selected={isActive}
                onClick={() => onSelectSection(section.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 ${
                  isActive
                    ? "bg-gray-900 text-white shadow-sm"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? "text-white" : "text-gray-500"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <span className="block truncate">{section.label}</span>
                </div>
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
