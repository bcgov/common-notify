import { useMemo, useState } from 'react'
import type { FC } from 'react'
import { Button, Modal, Select } from '@bcgov/design-system-react-components'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { selectTenant } from '@/redux/slices/tenant.slice'
import type { Tenant } from '@/interfaces/CstarTenant'
import UserService from '@/service/user-service'
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

const CSTAR_TENANT_SETUP_URL =
  import.meta.env.VITE_CSTAR_TENANT_SETUP_URL ||
  'https://cstar-dev.apps.silver.devops.gov.bc.ca'

const TenantSelectionModal: FC = () => {
  const dispatch = useAppDispatch()
  const showModal = useAppSelector((state) => state.tenant.showTenantModal)
  const tenants = useAppSelector((state) => state.cstar.tenants)
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null)

  const tenantItems = useMemo(
    () =>
      tenants.map((tenant) => ({
        id: tenant.id,
        label: tenant.name,
      })),
    [tenants],
  )

  const handleSelectTenant = (tenant: Tenant) => {
    dispatch(selectTenant(tenant))
  }

  const handleCancelSelection = () => {
    setPendingTenantId(null)
  }

  const handleSignOut = () => {
    handleCancelSelection()
    UserService.doLogout()
  }

  const handleContinue = () => {
    if (!pendingTenantId) {
      return
    }

    const tenant = tenants.find((item) => item.id === pendingTenantId)
    if (tenant) {
      handleSelectTenant(tenant)
    }
  }

  const handleTenantSetupRedirect = () => {
    window.location.href = CSTAR_TENANT_SETUP_URL
  }

  const isZeroTenantState = tenants.length === 0
  const isMultiTenantState = showModal && tenants.length > 1

  if (!isZeroTenantState && !isMultiTenantState) {
    return null
  }

  return (
    <Modal
      isOpen={isZeroTenantState || isMultiTenantState}
      title={isZeroTenantState ? 'Set up your tenant' : 'Select a tenant'}
      onClose={handleSignOut}
      closeOnBackdropClick={false}
      closeOnEscape={false}
    >
      <div className="tenant-selection-modal-content">
        {isZeroTenantState ? (
          <>
            <p className="tenant-selection-description">
              You do not have a tenant set up yet. Create one to get started.
            </p>
            <div className="tenant-selection-footer">
              <Button variant="tertiary" type="button" onClick={handleSignOut}>
                Sign out
              </Button>
              <Button variant="primary" type="button" onClick={handleTenantSetupRedirect}>
                Create tenant
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="tenant-selection-description">Please choose a tenant to continue.</p>
            <div className="tenant-selection-field">
              <Select
                aria-label="Select a tenant"
                items={tenantItems}
                placeholder="Select a tenant"
                selectedKey={(pendingTenantId ?? null) as any}
                onSelectionChange={(key) => setPendingTenantId((key as string | null) ?? null)}
              />
            </div>
            <div className="tenant-selection-footer">
              <Button variant="tertiary" type="button" onClick={handleSignOut}>
                Sign out
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={handleContinue}
                isDisabled={!pendingTenantId}
              >
                Continue
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

export default TenantSelectionModal
