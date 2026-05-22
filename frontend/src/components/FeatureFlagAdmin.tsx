import React, { useEffect, useState } from 'react'
import type { FC } from 'react'
import { useAppDispatch, useAppSelector } from '../redux/hooks'
import type { FeatureFlag } from '../interfaces/feature-flag.interface'
import {
  fetchAllFeatureFlags,
  createFeatureFlag,
  updateFeatureFlag,
} from '@/redux/slices/featureFlags.slice'
import {
  selectAllFeatureFlagsList,
  selectFeatureFlagsLoading,
} from '@/config/featureFlags/featureFlagsSelectors'
import { showErrorToast, showSuccessToast } from '../redux/utils/toastUtils'
import PageHeading from './PageHeading'
import { DataTable } from './DataTable/DataTable'
import type { TableColumn } from './DataTable/DataTable'
import { Button } from '@bcgov/design-system-react-components'
import { Toggle } from './Toggle'
import { StatusBadge } from './StatusBadge'
import GenericModal from './GenericModal'

/**
 * Feature Flag Admin Component
 *
 * Allows administrators to:
 * - View all feature flags (global + tenant overrides)
 * - Toggle feature flags on/off
 * - Create tenant-specific overrides
 * - Remove tenant overrides
 *
 * Requires NOTIFY_ADMIN role
 */
const FeatureFlagAdmin: FC = () => {
  const dispatch = useAppDispatch()
  const flags = useAppSelector(selectAllFeatureFlagsList)
  const tenants = useAppSelector((state) => state.adminTenants.items)
  const loading = useAppSelector(selectFeatureFlagsLoading)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null)

  const handleToggle = async (id: string, currentEnabled: boolean) => {
    setTogglingId(id)
    try {
      await dispatch(updateFeatureFlag({ id, enabled: !currentEnabled })).unwrap()
      showSuccessToast('Feature flag updated successfully')
      // Refetch all flags after update
      dispatch(fetchAllFeatureFlags())
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to update feature flag')
    } finally {
      setTogglingId(null)
    }
  }

  // Helper: Get tenant name by ID
  const getTenantName = (tenantId: string): string => {
    return tenants.find((t) => t.id === tenantId)?.name || `Unknown (${tenantId.slice(0, 8)}...)`
  }

  // Define table columns
  const columns: TableColumn<FeatureFlag>[] = [
    {
      key: 'code',
      label: 'Feature Flag',
      width: '220px',
      render: (_, row) => row.flagCode?.displayName || row.code,
    },
    {
      key: 'enabled',
      label: 'Status',
      width: '100px',
      render: (value) => <StatusBadge status={value as boolean} />,
    },
    {
      key: 'tenantId',
      label: 'Tenants',
      width: '200px',
      render: (value) => {
        if (!value) {
          return <span className="text-muted">All Tenants</span>
        }
        return <span>{getTenantName(value as string)}</span>
      },
    },
    {
      key: 'createdAt',
      label: 'Created',
      width: '160px',
      render: (value) => <span>{new Date(value as string).toLocaleDateString()}</span>,
    },
    {
      key: 'id',
      label: 'Toggle',
      width: '80px',
      render: (_, row) => (
        <Toggle
          checked={row.enabled}
          onChange={() => handleToggle(row.id, row.enabled)}
          disabled={togglingId === row.id}
          ariaLabel={row.enabled ? 'Disable feature flag' : 'Enable feature flag'}
          title={row.enabled ? 'Click to disable' : 'Click to enable'}
        />
      ),
    },
  ]

  return (
    <div>
      <PageHeading title="Feature Flag Administration" />

      <div className="mb-3">
        <Button variant="primary" onClick={() => setShowCreateForm(true)}>
          Create New Feature Flag
        </Button>
      </div>

      <CreateFlagFormModal
        isOpen={showCreateForm}
        onSuccess={() => {
          setShowCreateForm(false)
          dispatch(fetchAllFeatureFlags())
        }}
        onCancel={() => setShowCreateForm(false)}
      />

      {selectedTenantId && (
        <TenantScopeModal
          tenantId={selectedTenantId}
          flags={flags}
          onClose={() => setSelectedTenantId(null)}
        />
      )}

      <DataTable<FeatureFlag>
        columns={columns}
        data={flags}
        keyExtractor={(flag) => flag.id}
        isLoading={loading}
        isEmpty={flags.length === 0}
        emptyMessage="No feature flags found"
        variant="bordered"
        size="sm"
      />
    </div>
  )
}

/**
 * Modal component for creating a new feature flag
 */
function CreateFlagFormModal({
  isOpen,
  onSuccess,
  onCancel,
}: {
  isOpen: boolean
  onSuccess: () => void
  onCancel: () => void
}) {
  const dispatch = useAppDispatch()
  const tenants = useAppSelector((state) => state.adminTenants.items)
  const flags = useAppSelector(selectAllFeatureFlagsList)
  const [code, setCode] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [tenantId, setTenantId] = useState('')
  const [loading, setLoading] = useState(false)

  // Extract unique feature codes from all flags
  const featureCodes = Array.from(
    new Map(flags.filter((f) => f.flagCode).map((f) => [f.code, f.flagCode!])).values(),
  )

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCode('')
      setEnabled(true)
      setTenantId('')
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!code.trim()) {
      showErrorToast('Feature code is required')
      return
    }

    setLoading(true)
    try {
      await dispatch(
        createFeatureFlag({
          code: code.trim(),
          enabled,
          tenantId: tenantId || undefined,
        }),
      ).unwrap()
      showSuccessToast('Feature flag created successfully')
      setCode('')
      setEnabled(true)
      setTenantId('')
      onSuccess()
    } catch (err) {
      let errorMessage = 'Failed to create feature flag'

      if (typeof err === 'string') {
        errorMessage = err
      } else if (err instanceof Error) {
        errorMessage = err.message
      }

      // Check if this is a duplicate flag error and provide better message
      if (errorMessage.toLowerCase().includes('already exists')) {
        errorMessage = `This feature flag already exists${tenantId ? ' for the selected tenant' : ' globally'}. Please choose a different flag or tenant.`
      }

      showErrorToast(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <GenericModal
      isOpen={isOpen}
      onClose={onCancel}
      title="Create New Feature Flag"
      onSubmit={handleSubmit}
      submitText="Create"
      isSubmitLoading={loading}
      cancelText="Cancel"
    >
      <div className="mb-3">
        <label htmlFor="code" className="form-label">
          Feature Code <span className="text-danger">*</span>
        </label>
        <select
          id="code"
          className="form-select"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        >
          <option value="">Select a feature code...</option>
          {featureCodes.map((fc) => (
            <option key={fc.code} value={fc.code}>
              {fc.displayName}
            </option>
          ))}
        </select>
        <small className="form-text text-muted">Select from existing feature codes</small>
      </div>

      <div className="mb-3">
        <div className="form-check">
          <input
            id="enabled"
            type="checkbox"
            className="form-check-input"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <label className="form-check-label" htmlFor="enabled">
            Enable this flag
          </label>
        </div>
      </div>

      <div className="mb-3">
        <label htmlFor="tenantId" className="form-label">
          Tenants <span className="text-muted">(optional)</span>
        </label>
        <select
          id="tenantId"
          className="form-select"
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
        >
          <option value="">Global (All Tenants)</option>
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name}
            </option>
          ))}
        </select>
        <small className="form-text text-muted">
          Leave empty to create a global flag, or select a specific tenant for an override
        </small>
      </div>
    </GenericModal>
  )
}

/**
 * Modal component for viewing tenant-specific feature flag overrides
 */
function TenantScopeModal({
  tenantId,
  flags,
  onClose,
}: {
  tenantId: string
  flags: FeatureFlag[]
  onClose: () => void
}) {
  const tenantFlags = flags.filter((flag) => flag.tenantId === tenantId)
  const globalFlags = flags.filter((flag) => !flag.tenantId)

  return (
    <GenericModal isOpen={true} onClose={onClose} title="Tenant Overrides" cancelText="Close">
      <p className="mb-3">
        <strong>Tenant ID:</strong> <code>{tenantId}</code>
      </p>

      <h6 className="mb-2">Feature Flags Enabled for This Tenant:</h6>
      {tenantFlags.length > 0 ? (
        <div className="table-responsive mb-3">
          <table className="table table-sm table-bordered mb-0">
            <thead className="table-light">
              <tr>
                <th>Feature Flag</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tenantFlags.map((flag) => (
                <tr key={flag.id}>
                  <td>{flag.flagCode?.displayName || flag.code}</td>
                  <td>
                    <StatusBadge status={flag.enabled} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted mb-3">No tenant-specific overrides</p>
      )}

      <hr />

      <div className="alert alert-info mb-0">
        <strong>Note:</strong> This tenant has {globalFlags.length} global feature flags available.
        Tenant-specific overrides shown above take precedence over global settings.
      </div>
    </GenericModal>
  )
}

export default FeatureFlagAdmin
