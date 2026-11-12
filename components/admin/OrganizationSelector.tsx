export interface OrganizationItem {
  id: string;
  name: string;
  slug: string;
}

export interface OrganizationSelectorProps {
  organizations: OrganizationItem[];
  selectedOrgId: string | null;
  onSelectOrg: (organizationId: string) => void;
  onCreateOrg?: () => void;
  disabled?: boolean;
}

/**
 * Organization selection dropdown card for the QueueFlow Admin Dashboard.
 * Allows administrators to switch between organizations they administer.
 */
export function OrganizationSelector({
  organizations,
  selectedOrgId,
  onSelectOrg,
  onCreateOrg,
  disabled = false,
}: OrganizationSelectorProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <label
            htmlFor="admin-org-select"
            className="block text-sm font-semibold text-gray-900"
          >
            Active Organization
          </label>
          <p className="mt-0.5 text-xs text-gray-500">
            Select an organization to verify your administrator access and view settings.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="sm:w-72">
            <select
              id="admin-org-select"
              aria-label="Active Organization"
              value={selectedOrgId ?? ""}
              onChange={(e) => onSelectOrg(e.target.value)}
              disabled={disabled}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} (@{org.slug})
                </option>
              ))}
            </select>
          </div>
          {onCreateOrg && (
            <button
              type="button"
              onClick={onCreateOrg}
              disabled={disabled}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50"
            >
              <svg
                className="mr-1.5 h-4 w-4 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              New Organization
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
