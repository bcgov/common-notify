import { useState } from 'react'
import type { FC } from 'react'
import { Button, Form, TextField, Select } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/PageHeading'
import Card from '@/components/Card'
import { adminApi } from '@/api/admin.api'
import type { LinkClientToTenantsRequest } from '@/api/admin.api'
import { showSuccessToast, showErrorToast } from '@/redux/utils/toastUtils'

interface FormState {
  client_id: string
  client_secret: string
  selected_tenant_ids: string[]
}

/**
 * LinkClientToTenantsForm Component
 *
 * Allows NOTIFY_ADMIN users to register API Gateway clients with CSTAR tenants.
 * This enables service-to-service authentication by linking client credentials to tenants.
 *
 * Security:
 * - Client credentials are used only for OAuth2 verification (never stored)
 * - Admin must select which tenants can use this client
 * - Complete audit trail recorded
 *
 * Loading state is managed globally via redux/axios interceptor
 * Success/error feedback via react-toastify notifications
 */
const LinkClientToTenantsForm: FC = () => {
  const [formState, setFormState] = useState<FormState>({
    client_id: '',
    client_secret: '',
    selected_tenant_ids: [],
  })

  const handleInputChange = (field: keyof FormState) => (value: string | string[]) => {
    if (field === 'selected_tenant_ids') {
      // Ensure selected_tenant_ids is always an array
      const arrayValue = Array.isArray(value) ? value : value ? [value] : []
      setFormState((prev) => ({ ...prev, [field]: arrayValue }))
    } else if (typeof value === 'string') {
      setFormState((prev) => ({ ...prev, [field]: value }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
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

      // Reset form after successful submission
      setFormState({
        client_id: '',
        client_secret: '',
        selected_tenant_ids: [],
      })
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to link client to tenants')
    }
  }

  // Mock tenant list - in a real implementation, fetch from API
  const mockTenants = [
    { id: 'e76976ea-7f4b-4b78-b35f-1fc07d11441e', label: 'CSTAR Test Tenant 1' },
    { id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', label: 'CSTAR Test Tenant 2' },
    { id: '7ce9c880-2e0e-12e2-91c5-11d15fe441d9', label: 'CSTAR Test Tenant 3' },
  ]

  return (
    <div>
      <PageHeading title="Register API Gateway Client" />
      <div className="row">
        <div className="col-md-8">
          <Card className="mb-4" title="Link Client to Tenants">
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

              <div className="d-flex gap-2">
                <Button variant="primary" type="submit">
                  Register Client
                </Button>
              </div>
            </Form>
          </Card>

          <Card title="How It Works">
            <ol className="small">
              <li className="mb-2">
                <strong>Create API Portal Client:</strong> Register your service in the API Portal
                and generate client credentials
              </li>
              <li className="mb-2">
                <strong>Provide Credentials:</strong> Enter your client ID and secret above (secret
                is used only for verification)
              </li>
              <li className="mb-2">
                <strong>Select Tenants:</strong> Choose which CSTAR tenants this client can access
              </li>
              <li className="mb-2">
                <strong>Register Service:</strong> Click &quot;Register Client&quot; to complete the
                setup
              </li>
              <li>
                <strong>Use Service:</strong> Your service can now authenticate using client
                credentials flow
              </li>
            </ol>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default LinkClientToTenantsForm
