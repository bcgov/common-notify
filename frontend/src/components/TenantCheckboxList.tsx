import type { FC } from 'react'

interface Tenant {
  id: string
  name: string
}

interface TenantCheckboxListProps {
  tenants: Tenant[]
  selectedTenantIds: string[]
  onChange: (selectedIds: string[]) => void
  required?: boolean
}

/**
 * TenantCheckboxList Component
 *
 * Displays a list of tenants with checkboxes for easy multi-selection
 */
const TenantCheckboxList: FC<TenantCheckboxListProps> = ({
  tenants,
  selectedTenantIds,
  onChange,
  required,
}) => {
  const handleCheckboxChange = (tenantId: string, isChecked: boolean) => {
    if (isChecked) {
      onChange([...selectedTenantIds, tenantId])
    } else {
      onChange(selectedTenantIds.filter((id) => id !== tenantId))
    }
  }

  const selectAll = () => {
    onChange(tenants.map((t) => t.id))
  }

  const deselectAll = () => {
    onChange([])
  }

  return (
    <div className="tenant-checkbox-list">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <label className="form-label">
          Select Tenants
          {required && <span className="text-danger ms-1">*</span>}
        </label>
        <div className="btn-group btn-group-sm" role="group">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={selectAll}
            title="Select all tenants"
          >
            All
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={deselectAll}
            title="Deselect all tenants"
          >
            None
          </button>
        </div>
      </div>

      <div
        className="border rounded p-3"
        style={{
          maxHeight: '300px',
          overflowY: 'auto',
          backgroundColor: '#f8f9fa',
        }}
      >
        {tenants.length === 0 ? (
          <p className="text-muted mb-0">No tenants available</p>
        ) : (
          <div className="d-flex flex-column gap-2">
            {tenants.map((tenant) => (
              <div key={tenant.id} className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id={`tenant-${tenant.id}`}
                  checked={selectedTenantIds.includes(tenant.id)}
                  onChange={(e) => handleCheckboxChange(tenant.id, e.target.checked)}
                />
                <label className="form-check-label" htmlFor={`tenant-${tenant.id}`}>
                  {tenant.name}
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedTenantIds.length > 0 && (
        <small className="text-muted d-block mt-2">
          {selectedTenantIds.length} of {tenants.length} tenant(s) selected
        </small>
      )}
    </div>
  )
}

export default TenantCheckboxList
