import type { FC } from 'react'
import { useState, useRef, useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { selectTenant } from '@/redux/slices/auth.slice'
import type { Tenant } from '@/interfaces/Tenant'
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
 *
 * If user has only 1 tenant, switcher is hidden (no need to switch).
 */

interface Props {
  className?: string
}

const TenantSwitcher: FC<Props> = ({ className = '' }) => {
  const dispatch = useAppDispatch()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const tenants = useAppSelector((state) => state.auth.tenants)
  const selectedTenant = useAppSelector((state) => state.auth.selectedTenant)

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
