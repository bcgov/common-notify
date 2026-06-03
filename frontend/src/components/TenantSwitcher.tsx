import type { FC } from 'react'
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { selectTenant } from '@/redux/slices/tenant.slice'
import { fetchCstarRoles } from '@/redux/thunks/cstar.thunks'
import type { Tenant } from '@/interfaces/CstarTenant'
import '@/scss/components/tenant-switcher.scss'

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
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const tenants = useAppSelector((state) => state.cstar.tenants)
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const authUser = useAppSelector((state) => state.auth.user)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Hide if only one tenant (no need to switch)
  if (tenants.length <= 1) {
    return null
  }

  const handleSelectTenant = (tenant: Tenant) => {
    dispatch(selectTenant(tenant))
    // Fetch user's roles in the selected tenant
    if (authUser?.id) {
      dispatch(fetchCstarRoles({ tenantId: tenant.id, ssoUserId: authUser.id })).then((result) => {
        // Check if the action was rejected (error fetching roles) or returned empty roles
        if (
          result.type === 'cstar/fetchRoles/rejected' ||
          (result.payload && Array.isArray(result.payload) && result.payload.length === 0)
        ) {
          // User has no roles in this tenant, redirect to not-authorized
          navigate({ to: '/not-authorized' })
        } else if (result.payload && Array.isArray(result.payload) && result.payload.length > 0) {
          // User has roles in this tenant, navigate to dashboard
          navigate({ to: '/dashboard' })
        }
      })
    }
    setIsOpen(false)
  }

  return (
    <div ref={dropdownRef} className={`tenant-switcher ${className}`}>
      <button
        className="tenant-switcher-button"
        onClick={() => setIsOpen(!isOpen)}
        title="Switch tenant"
        type="button"
      >
        <span className="tenant-switcher-label">{selectedTenant?.name || 'Select Tenant'}</span>
        <i className={`bi bi-chevron-down ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="tenant-switcher-dropdown">
          {tenants.map((tenant) => (
            <button
              key={tenant.id}
              className={`tenant-switcher-item ${selectedTenant?.id === tenant.id ? 'active' : ''}`}
              onClick={() => handleSelectTenant(tenant)}
              type="button"
            >
              <span className="tenant-switcher-name">{tenant.name}</span>
              {selectedTenant?.id === tenant.id && <i className="bi bi-check-lg" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default TenantSwitcher
