import { useState } from 'react'
import type { FC } from 'react'
import { Button, Form, TextField, Select } from '@bcgov/design-system-react-components'
import { adminApi } from '@/api/admin.api'
import type { LinkClientToTenantsRequest } from '@/api/admin.api'
import { showSuccessToast, showErrorToast } from '@/redux/utils/toastUtils'

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
  const [formState, setFormState] = useState<FormState>({
    client_id: '',
    client_secret: '',
    selected_tenant_ids: [],
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
      const request: LinkClientToTenantsRequest = {
        client_id: formState.client_id.trim(),
        client_secret: formState.client_secret.trim(),
        tenant_ids: formState.selected_tenant_ids,
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

  const mockTenants = [
    { id: '9c7fa2db-fc59-4d3c-acff-aab78a251094', label: 'CSTAR Test Tenant 1' },
    { id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', label: 'CSTAR Test Tenant 2' },
    { id: '7ce9c880-2e0e-12e2-91c5-11d15fe441d9', label: 'CSTAR Test Tenant 3' },
  ]

  return (
    <>
      {isOpen && <div className="modal-backdrop fade show" style={{ zIndex: 1040 }}></div>}
      <div
        className={`modal ${isOpen ? 'show' : ''}`}
        style={{ display: isOpen ? 'block' : 'none', zIndex: 1050 }}
      >
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Register New Client</h5>
              <button
                type="button"
                className="btn-close"
                onClick={onClose}
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body">
              <Form className="d-flex flex-column gap-3" onSubmit={handleSubmit}>
                <TextField
                  label={
                    <>
                      Client ID <span className="text-danger">*</span>
                    </>
                  }
                  placeholder="e.g., my-service-client"
                  value={formState.client_id}
                  onChange={(value) => handleInputChange('client_id')(value)}
                  maxLength={50}
                  required
                  description="The client ID from your API Portal"
                />

                <TextField
                  label={
                    <>
                      Client Secret <span className="text-danger">*</span>
                    </>
                  }
                  type="password"
                  placeholder="Enter your client secret"
                  value={formState.client_secret}
                  onChange={(value) => handleInputChange('client_secret')(value)}
                  maxLength={100}
                  required
                  description="This will only be used to verify client ownership and will not be stored"
                />

                <Select
                  label={
                    <>
                      Select Tenants <span className="text-danger">*</span>
                    </>
                  }
                  placeholder="Choose tenants..."
                  items={mockTenants}
                  value={formState.selected_tenant_ids}
                  onChange={(value) => handleInputChange('selected_tenant_ids')(value)}
                  multiple
                  style={{ width: '100%' }}
                  required
                  description="Choose which CSTAR tenants this client can access"
                />

                <div className="d-flex gap-2 justify-content-end">
                  <Button variant="secondary" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit">
                    Register Client
                  </Button>
                </div>
              </Form>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default RegisterClientModal
