import { useState } from 'react'
import type { FC } from 'react'
import TextField from '@/components/InputWrappers/TextField'
import TenantCheckboxList from '@/components/TenantCheckboxList'
import GenericModal from '@/components/GenericModal'
import { adminApi } from '@/api/admin.api'
import type { LinkClientToTenantsRequest } from '@/api/admin.api'
import { showSuccessToast, showErrorToast } from '@/redux/utils/toastUtils'
import { useAppSelector } from '@/redux/hooks'

interface FormState {
  client_id: string
  client_secret: string
  selected_tenant_ids: string[]
}

interface RegisterClientModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

/**
 * RegisterClientModal Component
 *
 * Modal dialog for registering API Gateway clients with CSTAR tenants.
 */
const RegisterClientModal: FC<RegisterClientModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const cstarTenants = useAppSelector((state) => state.cstar.tenants)
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)

  const [formState, setFormState] = useState<FormState>({
    client_id: '',
    client_secret: '',
    selected_tenant_ids: selectedTenant ? [selectedTenant.id] : [],
  })

  const handleInputChange = (field: keyof FormState) => (value: string | string[]) => {
    if (field === 'selected_tenant_ids') {
      const arrayValue = Array.isArray(value) ? value : value ? [value] : []
      setFormState((prev) => ({ ...prev, [field]: arrayValue }))
    } else if (typeof value === 'string') {
      setFormState((prev) => ({ ...prev, [field]: value }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formState.client_id.trim()) {
      showErrorToast('Client ID is required')
      return
    }

    if (!formState.client_secret.trim()) {
      showErrorToast('Client Secret is required')
      return
    }

    if (formState.selected_tenant_ids.length === 0) {
      showErrorToast('Please select at least one tenant')
      return
    }

    try {
      // Map selected tenant IDs to TenantReference objects
      const selectedTenants = formState.selected_tenant_ids
        .map((tenantId) => cstarTenants.find((t) => t.id === tenantId))
        .filter((t) => t !== undefined)
        .map((t) => ({ id: t!.id, name: t!.name }))

      if (selectedTenants.length !== formState.selected_tenant_ids.length) {
        showErrorToast('One or more selected tenants could not be found')
        return
      }

      const request: LinkClientToTenantsRequest = {
        client_id: formState.client_id.trim(),
        client_secret: formState.client_secret.trim(),
        tenant_ids: selectedTenants,
      }

      const response = await adminApi.linkClientToTenants(request)

      showSuccessToast(`Successfully linked client to ${response.count} tenant(s)`)

      setFormState({
        client_id: '',
        client_secret: '',
        selected_tenant_ids: [],
      })

      onSuccess?.()
      onClose()
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to link client to tenants')
    }
  }

  const handleClose = () => {
    setFormState({
      client_id: '',
      client_secret: '',
      selected_tenant_ids: selectedTenant ? [selectedTenant.id] : [],
    })
    onClose()
  }

  return (
    <GenericModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Register New Client"
      onSubmit={handleSubmit}
      submitText="Register Client"
      isSubmitLoading={false}
      cancelText="Cancel"
    >
      <TextField
        label="Client ID"
        placeholder="e.g., my-service-client"
        value={formState.client_id}
        onChange={(value) => handleInputChange('client_id')(value)}
        maxLength={50}
        required
        description="The client ID from your API Portal"
      />

      <TextField
        label="Client Secret"
        placeholder="Enter your client secret"
        type="password"
        value={formState.client_secret}
        onChange={(value) => handleInputChange('client_secret')(value)}
        maxLength={100}
        required
        description="This will only be used to verify client ownership and will not be stored"
      />

      <TenantCheckboxList
        tenants={cstarTenants}
        selectedTenantIds={formState.selected_tenant_ids}
        onChange={(value) => handleInputChange('selected_tenant_ids')(value)}
        required
      />
    </GenericModal>
  )
}

export default RegisterClientModal
