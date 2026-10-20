export interface OrganizationItem {
  id: string;
  name: string;
  slug: string;
}

export interface StaffOrgSelectorProps {
  organizations: OrganizationItem[];
  selectedOrgId: string | null;
  onSelectOrg: (organizationId: string) => void;
}

export function StaffOrgSelector({
  organizations,
  selectedOrgId,
  onSelectOrg,
}: StaffOrgSelectorProps) {
  const selectedOrganization =
    organizations.find((org) => org.id === selectedOrgId) ??
    (organizations.length === 1 ? organizations[0] : null);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Organization
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Select the organization you are operating for today.
          </p>
        </div>
        {organizations.length > 1 ? (
          <div className="min-w-[240px]">
            <label htmlFor="org-select" className="sr-only">
              Select Organization
            </label>
            <select
              id="org-select"
              value={selectedOrgId ?? ""}
              onChange={(e) => onSelectOrg(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          selectedOrganization && (
            <span className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-900">
              {selectedOrganization.name}
            </span>
          )
        )}
      </div>
    </div>
  );
}
