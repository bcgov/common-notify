import { useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import { useAppSelector } from '@/redux/hooks'
import { DataTable } from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
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

  // Define table columns
  const columns: TableColumn<ClientTenantMapping>[] = [
    {
      key: 'client_id',
      label: 'Client ID',
      width: '140px',
    },
    {
      key: 'tenant_name',
      label: 'Tenant Name',
      width: '200px',
    },
    {
      key: 'is_active',
      label: 'Status',
      width: '120px',
      render: (value) => <StatusBadge status={value as boolean} />,
    },
    {
      key: 'created_by',
      label: 'Created By',
      width: '160px',
      render: (value, row) => getUserUsername(value as string, row.created_by_username),
    },
    {
      key: 'created_at',
      label: 'Created At',
      width: '140px',
      render: (value) => new Date(value as string).toLocaleDateString(),
    },
    {
      key: 'id',
      label: 'Action',
      width: '100px',
      render: (_, row) => (
        <Toggle
          checked={row.is_active}
          onChange={() => handleToggleStatus(row)}
          disabled={togglingId === row.id}
          ariaLabel={row.is_active ? 'Disable client mapping' : 'Enable client mapping'}
          title={row.is_active ? 'Click to disable' : 'Click to enable'}
        />
      ),
    },
  ]

  return (
    <DataTable<ClientTenantMapping>
      columns={columns}
      data={mappings}
      keyExtractor={(mapping) => mapping.id}
      isLoading={loading}
      isEmpty={mappings.length === 0}
      emptyMessage="No client-tenant mappings found"
      variant="bordered"
      size="sm"
    />
  )
})

ClientTenantMappingsList.displayName = 'ClientTenantMappingsList'

export default ClientTenantMappingsList
