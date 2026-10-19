export interface OrganizationItem {
  id: string;
  name: string;
  slug: string;
}

export interface OrganizationSelectorProps {
  organizations: OrganizationItem[];
  selectedOrgId: string | null;
  onSelectOrg: (organizationId: string) => void;
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
      </div>
    </div>
  );
}
