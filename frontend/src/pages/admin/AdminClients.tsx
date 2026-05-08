import { useRef, useState } from 'react'
import type { FC } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/PageHeading'
import Card from '@/components/Card'
import ClientTenantMappingsList from '@/components/ClientTenantMappingsList'
import RegisterClientModal from '@/components/RegisterClientModal'

/**
 * Admin Clients Page
 * Manage API Gateway client registration and tenant mapping
 */
const AdminClients: FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const mappingsListRef = useRef<{ refetch?: () => void }>(null)

  const handleModalSuccess = () => {
    // Refresh the mappings list after successful registration
    mappingsListRef.current?.refetch?.()
  }

  return (
    <div>
      <PageHeading title="API Gateway Clients" />

      <div className="row">
        <div className="col-lg-8">
          <ClientTenantMappingsList ref={mappingsListRef} />
          <div className="mt-3">
            <Button variant="primary" onClick={() => setIsModalOpen(true)}>
              Register New Client
            </Button>
          </div>
        </div>
        <div className="col-lg-4">
          <Card title="How It Works">
            <ol className="small">
              <li className="mb-2">
                <strong>Create API Portal Client:</strong> Register your service in the{' '}
                <a
                  href="https://api.gov.bc.ca/devportal/api-directory"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  API Portal
                </a>{' '}
                and generate client credentials
              </li>
              <li className="mb-2">
                <strong>Provide Credentials:</strong> Click &quot;Register New Client&quot; (to the
                left) and enter your client ID and secret (secret is used only for verification)
              </li>
              <li className="mb-2">
                <strong>Select Tenants:</strong> Choose which CSTAR tenants this client can access
              </li>
              <li className="mb-2">
                <strong>Register Service:</strong> Click &quot;Register Client&quot; in the modal to
                complete the setup
              </li>
              <li>
                <strong>Manage:</strong> View and disable/enable clients as needed
              </li>
            </ol>
          </Card>
        </div>
      </div>

      <RegisterClientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
      />
    </div>
  )
}

export default AdminClients
