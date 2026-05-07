import { useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import { useAppSelector } from '@/redux/hooks'
import { Button } from '@bcgov/design-system-react-components'
import Card from '@/components/Card'
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
  const { allUsers } = useAppSelector((state) => state.user)

  // Helper function to get username from store for audit trail display
  const getUserUsername = (externalId: string): string => {
    const user = allUsers.find((u) => u.externalId === externalId)
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
          <table className="table table-sm table-hover">
            <thead>
              <tr>
                <th>Client ID</th>
                <th>Tenant Name</th>
                <th>Status</th>
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
                  <td>
                    <span className={`badge ${mapping.is_active ? 'bg-success' : 'bg-secondary'}`}>
                      {mapping.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td>{getUserUsername(mapping.created_by)}</td>
                  <td>
                    {new Date(mapping.created_at).toLocaleDateString()}{' '}
                    {new Date(mapping.created_at).toLocaleTimeString()}
                  </td>
                  <td>
                    <Button
                      size="small"
                      variant={mapping.is_active ? 'danger' : 'success'}
                      onClick={() => handleToggleStatus(mapping)}
                      disabled={togglingId === mapping.id}
                    >
                      {togglingId === mapping.id
                        ? 'Loading...'
                        : mapping.is_active
                          ? 'Disable'
                          : 'Enable'}
                    </Button>
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
