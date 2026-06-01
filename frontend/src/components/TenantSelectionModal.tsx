import { useMemo, useState } from 'react'
import type { FC } from 'react'
import { AlertDialog, Button, Modal, Select } from '@bcgov/design-system-react-components'
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
  import.meta.env.VITE_CSTAR_TENANT_SETUP_URL || 'https://cstar-dev.apps.gold.devops.gov.bc.ca'

const TenantSelectionModal: FC = () => {
  const dispatch = useAppDispatch()
  const showModal = useAppSelector((state) => state.tenant.showTenantModal)
  const tenants = useAppSelector((state) => state.cstar.tenants)
  const [pendingTenantId, setPendingTenantId] = useState<string | undefined>(undefined)

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
    setPendingTenantId(undefined)
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

  const buttons = isZeroTenantState ? (
    <>
      <Button variant="tertiary" type="button" onPress={handleSignOut}>
        Sign out
      </Button>
      <Button variant="primary" type="button" onPress={handleTenantSetupRedirect}>
        Create tenant
      </Button>
    </>
  ) : (
    <>
      <Button variant="tertiary" type="button" onPress={handleSignOut}>
        Sign out
      </Button>
      <Button
        variant="primary"
        type="button"
        onPress={handleContinue}
        isDisabled={!pendingTenantId}
      >
        Continue
      </Button>
    </>
  )

  return (
    <Modal
      isOpen={isZeroTenantState || isMultiTenantState}
      isDismissable={false}
      isKeyboardDismissDisabled
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          handleSignOut()
        }
      }}
    >
      <AlertDialog
        title={isZeroTenantState ? 'Set up your tenant' : 'Select a tenant'}
        isCloseable
        buttons={buttons}
      >
        <div className="tenant-selection-modal-content">
          {isZeroTenantState ? (
            <p className="tenant-selection-description">
              You do not have a tenant set up yet. Create one to get started.
            </p>
          ) : (
            <>
              <p className="tenant-selection-description">Please choose a tenant to continue.</p>
              <div className="tenant-selection-field">
                <Select
                  aria-label="Select a tenant"
                  items={tenantItems}
                  placeholder="Select a tenant"
                  selectedKey={pendingTenantId}
                  onSelectionChange={(key) =>
                    setPendingTenantId((key as string | null) ?? undefined)
                  }
                />
              </div>
            </>
          )}
        </div>
      </AlertDialog>
    </Modal>
  )
}

export default TenantSelectionModal
