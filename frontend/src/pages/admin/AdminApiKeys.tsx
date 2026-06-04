import { useRef, useState } from 'react'
import type { FC } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Alert } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/PageHeading'
import ApiKeyList from '@/components/ApiKeyList'
import GenerateApiKeyModal from '@/components/GenerateApiKeyModal'
import type { GeneratedApiKeyResponse } from '@/api/apiKeyService'

/**
 * Admin API Keys Page
 * Manage API keys for the tenant
 *
 * NOTE: Authorization guards are deferred.
 * When merged with the auth branch, this page will require appropriate CSTAR roles
 * (e.g., ROLE_ADMIN or ROLE_API_KEY_MANAGER).
 */
const AdminApiKeys: FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [generatedKey, setGeneratedKey] = useState<GeneratedApiKeyResponse | null>(null)
  const keyListRef = useRef<{ refetch?: () => void }>(null)

  if (!tenantId) {
    return (
      <div>
        <PageHeading title="API Keys" />
        <Alert type="error" title="Error">
          Tenant ID is required to manage API keys.
        </Alert>
      </div>
    )
  }

  const handleGenerateSuccess = (key: GeneratedApiKeyResponse) => {
    setGeneratedKey(key)
    // Refresh the list after successful generation
    keyListRef.current?.refetch?.()
  }

  const handleRevokeSuccess = () => {
    // No additional action needed, list will be refreshed automatically
  }

  return (
    <div>
      <PageHeading title="API Key Management" />

      {generatedKey && (
        <Alert type="success" title="API Key Created">
          Your API key <code>{generatedKey.displayName}</code> has been successfully created and is
          ready to use.
        </Alert>
      )}

      <div className="mb-4">
        <p className="text-gray-700 mb-4">
          Manage API keys for your tenant. API keys are used to authenticate requests to the
          notification API.
        </p>

        <p className="text-sm text-gray-600 mb-4">
          <strong>Important:</strong> API keys are shown only once at creation time. Store them
          securely and never commit them to version control.
        </p>
      </div>

      <div className="mb-4">
        <Button variant="primary" onClick={() => setIsModalOpen(true)}>
          Generate New API Key
        </Button>
      </div>

      <div className="bg-white p-4 rounded border">
        <h2 className="text-lg font-semibold mb-4">Your API Keys</h2>
        <ApiKeyList ref={keyListRef} tenantId={tenantId} onRevokeSuccess={handleRevokeSuccess} />
      </div>

      <GenerateApiKeyModal
        tenantId={tenantId}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleGenerateSuccess}
      />
    </div>
  )
}

export default AdminApiKeys
