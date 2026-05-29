import { useRef, useState } from 'react'
import type { FC } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/PageHeading'
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

      <div className="mb-3">
        <Button variant="primary" onClick={() => setIsModalOpen(true)}>
          Register New Client
        </Button>
      </div>

      <ClientTenantMappingsList ref={mappingsListRef} />

      <RegisterClientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
      />
    </div>
  )
}

export default AdminClients
