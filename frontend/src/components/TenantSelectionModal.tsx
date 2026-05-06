import type { FC } from 'react'
import { Modal } from '@bcgov/design-system-react-components'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { selectTenant } from '@/redux/slices/tenant.slice'
import type { Tenant } from '@/interfaces/CstarTenant'
import '@/scss/components/tenant-selection-modal.scss'

/**
 * TenantSelectionModal
 *
 * V3 Modal-based Tenant Selection Component
 * Displays when user has multiple tenants to choose from.
 *
 * User Flow:
 * 1. Modal appears on app load if multiple tenants exist
 * 2. User selects a tenant from the list
 * 3. Modal closes and app loads with selected tenant context
 */

const TenantSelectionModal: FC = () => {
  const dispatch = useAppDispatch()
  const showModal = useAppSelector((state) => state.tenant.showTenantModal)
  const tenants = useAppSelector((state) => state.cstar.tenants)

  const handleSelectTenant = (tenant: Tenant) => {
    dispatch(selectTenant(tenant))
    // Modal auto-closes via selectTenant reducer setting showTenantModal = false
  }

  if (!showModal || tenants.length <= 1) {
    return null
  }

  return (
    <Modal
      isOpen={showModal}
      title="Select a Tenant"
      onClose={() => {
        // Modal cannot be closed without selection (no close button shown)
        // Prevents user bypassing tenant selection
      }}
      // Disable close on backdrop click or escape
      closeOnBackdropClick={false}
      closeOnEscape={false}
    >
      <div className="tenant-selection-modal-content">
        <p className="tenant-selection-description">Choose which tenant you want to access:</p>

        <div className="tenant-selection-list">
          {tenants.map((tenant) => (
            <button
              key={tenant.id}
              className="tenant-selection-item"
              onClick={() => handleSelectTenant(tenant)}
              type="button"
            >
              <div className="tenant-selection-radio" />
              <div className="tenant-selection-info">
                <div className="tenant-selection-name">{tenant.name}</div>
                {tenant.ministryName && (
                  <div className="tenant-selection-id">{tenant.ministryName}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

export default TenantSelectionModal
