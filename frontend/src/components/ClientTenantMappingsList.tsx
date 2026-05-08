import { useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import { useAppSelector } from '@/redux/hooks'
import Card from '@/components/Card'
import { StatusBadge } from '@/components/StatusBadge'
import { Toggle } from '@/components/Toggle'
import { getAllMappings, toggleMappingActiveStatus } from '@/api/admin.api'
import type { ClientTenantMapping } from '@/api/admin.api'
import { showSuccessToast, showErrorToast } from '@/redux/utils/toastUtils'

/**
 * ClientTenantMappingsList Component
 *
 * Displays all client-tenant mappings with the ability to enable/disable them.
 * Shows client_id, tenant_id, and current active status.
 */
const ClientTenantMappingsList = forwardRef<{ refetch?: () => void }>((_props, ref) => {
  const [mappings, setMappings] = useState<ClientTenantMapping[]>([])
  const [loading, setLoading] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const usersState = useAppSelector((state) => state.users)
  const { allUsers = [] } = usersState

  // Helper function to get username - prefer stored username, fallback to lookup, then fallback to ID
  const getUserUsername = (externalId: string, storedUsername?: string): string => {
    // If we have the username stored in the database, use it directly
    if (storedUsername) {
      return storedUsername
    }

    // Otherwise, try to look up from Redux store
    // Handle case-insensitive matching and strip @azureidir suffix if present
    const normalizedId = externalId.toLowerCase().split('@')[0]
    const user = allUsers.find((u) => u.externalId.toLowerCase() === normalizedId)
    return user?.username || externalId
  }

  const fetchMappings = async () => {
    setLoading(true)
    try {
      const response = await getAllMappings()
      setMappings(response.mappings)
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to load mappings')
    } finally {
      setLoading(false)
    }
  }

  useImperativeHandle(ref, () => ({
    refetch: fetchMappings,
  }))

  useEffect(() => {
    fetchMappings()
  }, [])

  const handleToggleStatus = async (mapping: ClientTenantMapping) => {
    setTogglingId(mapping.id)
    try {
      const response = await toggleMappingActiveStatus(mapping.id)
      // Update local state, preserving tenant_name from original mapping
      setMappings((prev) =>
        prev.map((m) =>
          m.id === mapping.id ? { ...response.mapping, tenant_name: m.tenant_name } : m,
        ),
      )
      showSuccessToast(response.message)
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to toggle mapping status')
    } finally {
      setTogglingId(null)
    }
  }

  if (loading) {
    return <div className="p-3">Loading mappings...</div>
  }

  return (
    <Card className="mb-4">
      {mappings.length === 0 ? (
        <div className="p-3 text-muted">No client-tenant mappings found</div>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-hover" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th>Client ID</th>
                <th>Tenant Name</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Status</th>
                <th>Created By</th>
                <th>Created At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping) => (
                <tr key={mapping.id}>
                  <td>{mapping.client_id}</td>
                  <td>{mapping.tenant_name}</td>
                  <td
                    style={{
                      width: '120px',
                      textAlign: 'center',
                    }}
                  >
                    <StatusBadge isActive={mapping.is_active} />
                  </td>
                  <td>{getUserUsername(mapping.created_by, mapping.created_by_username)}</td>
                  <td title={new Date(mapping.created_at).toLocaleString()}>
                    {new Date(mapping.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ verticalAlign: 'middle', padding: '0.25rem 0.5rem' }}>
                    <Toggle
                      checked={mapping.is_active}
                      onChange={() => handleToggleStatus(mapping)}
                      disabled={togglingId === mapping.id}
                      ariaLabel={
                        mapping.is_active ? 'Disable client mapping' : 'Enable client mapping'
                      }
                      title={mapping.is_active ? 'Click to disable' : 'Click to enable'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
})

ClientTenantMappingsList.displayName = 'ClientTenantMappingsList'

export default ClientTenantMappingsList
