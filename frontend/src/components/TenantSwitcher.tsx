import type { FC } from 'react'
import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { selectTenant } from '@/redux/slices/tenant.slice'
import { fetchCstarRoles } from '@/redux/thunks/cstar.thunks'
import type { Tenant } from '@/interfaces/CstarTenant'
import '@/scss/components/tenant-switcher.scss'
import { Select } from '@bcgov/design-system-react-components'

/**
 * TenantSwitcher
 *
 * V3 Header Dropdown Tenant Switcher Component
 * Allows switching between tenants after initial selection.
 * Displays in the header next to user information.
 *
 * User Flow:
 * 1. Click on "Current Tenant" in header
 * 2. Dropdown opens with list of available tenants
 * 3. Click a tenant to switch context
 * 4. App re-renders with new tenant context
 * 5. User's roles for that tenant are fetched
 *
 * If user has only 1 tenant, switcher is hidden (no need to switch).
 */

interface Props {
  className?: string
}

const TenantSwitcher: FC<Props> = ({ className = '' }) => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  const tenants = useAppSelector((state) => state.cstar.tenants)
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)

  const tenantItems = useMemo(
    () =>
      tenants
        .map((tenant) => ({
          id: tenant.id,
          label: tenant.name,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [tenants],
  )

  // Hide if only one tenant (no need to switch)
  if (tenants.length <= 1) {
    return null
  }

  const handleSelectTenant = (tenant: Tenant) => {
    dispatch(selectTenant(tenant))
    // Fetch user's roles in the selected tenant
    dispatch(fetchCstarRoles({ tenantId: tenant.id })).then((result) => {
      // Check if the action was rejected (error fetching roles) or returned empty roles
      if (
        result.type === 'cstar/fetchRoles/rejected' ||
        (result.payload && Array.isArray(result.payload) && result.payload.length === 0)
      ) {
        // User has no roles in this tenant, redirect to not-authorized
        // (even if they're NOTIFY_ADMIN - admin role doesn't grant tenant access)
        navigate({ to: '/not-authorized' })
      } else if (result.payload && Array.isArray(result.payload) && result.payload.length > 0) {
        // User has roles in this tenant, navigate to dashboard
        navigate({ to: '/dashboard' })
      }
    })
  }

  const handleChange = (key: string | number | null) => {
    if (key == null) {
      return
    }

    const tenant = tenants.find((item) => item.id === String(key))
    if (tenant && tenant.id !== selectedTenant?.id) {
      handleSelectTenant(tenant)
    }
  }

  return (
    <div className={`tenant-switcher ${className}`}>
      <Select
        label="Tenant"
        items={tenantItems}
        value={selectedTenant?.id}
        onChange={handleChange}
      />
    </div>
  )
}

export default TenantSwitcher
