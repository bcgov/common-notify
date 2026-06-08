import { useState } from 'react'
import type { FC } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import GenericModal from '@/components/GenericModal'
import TextField from '@/components/InputWrappers/TextField'
import {
  apiKeyService,
  type GenerateApiKeyRequest,
  type GeneratedApiKeyResponse,
} from '@/api/apiKeyService'

interface GenerateApiKeyModalProps {
  tenantId: string
  tenantName?: string
  isOpen: boolean
  onClose: () => void
  onSuccess: (key: GeneratedApiKeyResponse) => void
}

/**
 * Generate API Key Modal
 * Allows users to generate a new API key for their tenant
 */
const GenerateApiKeyModal: FC<GenerateApiKeyModalProps> = ({
  tenantId,
  tenantName,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedKey, setGeneratedKey] = useState<GeneratedApiKeyResponse | null>(null)

  const handleGenerateKey = async () => {
    if (!displayName.trim()) {
      setError('Display name is required')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const request: GenerateApiKeyRequest = {
        displayName: displayName.trim(),
        description: description.trim() || undefined,
      }

      const result = await apiKeyService.generateKey(tenantId, request)
      setGeneratedKey(result)
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to generate API key. Please try again.'
      setError(errorMessage)
      console.error('Failed to generate API key:', {
        status: err.response?.status,
        data: err.response?.data,
        error: err,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    // Reset form on close
    setDisplayName('')
    setDescription('')
    setError(null)
    setGeneratedKey(null)
    onClose()
  }

  const handleSuccess = () => {
    onSuccess(generatedKey!)
    handleClose()
  }

  // Show generated key confirmation
  if (generatedKey) {
    return (
      <GenericModal
        isOpen={isOpen}
        onClose={handleClose}
        title="API Key Generated"
        cancelText="Close"
      >
        <div className="space-y-4">
          <div className="alert alert-success" role="alert">
            <strong>API Key successfully created:</strong> Copy the key below. You won&apos;t be
            able to see it again for security reasons.
          </div>

          <div className="bg-gray-50 p-4 rounded border border-gray-200">
            <p className="text-sm font-semibold text-gray-700 mb-2">API Key:</p>
            <div className="flex gap-2">
              <code className="flex-1 text-sm break-all font-mono bg-white p-2 rounded border">
                {generatedKey.key}
              </code>
              <Button
                variant="secondary"
                onPress={() => {
                  navigator.clipboard.writeText(generatedKey.key)
                }}
              >
                Copy
              </Button>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded border border-blue-200">
            <p className="text-sm text-blue-900">
              <strong>Display Name:</strong> {generatedKey.displayName}
            </p>
            {generatedKey.description && (
              <p className="text-sm text-blue-900 mt-2">
                <strong>Description:</strong> {generatedKey.description}
              </p>
            )}
          </div>

          <div className="alert alert-info" role="alert">
            <strong>Important:</strong> Store this key securely. Include it in your API requests as:
            <code className="block text-xs bg-white p-2 rounded mt-2">
              X-API-KEY: {generatedKey.key}
            </code>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="primary" onPress={handleSuccess}>
              Done
            </Button>
          </div>
        </div>
      </GenericModal>
    )
  }

  // Show form for generating new key
  return (
    <GenericModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Generate New API Key"
      onSubmit={(e) => {
        e.preventDefault()
        handleGenerateKey()
      }}
      submitText="Generate Key"
      isSubmitLoading={loading}
      closeOnBackdropClick={!loading}
    >
      {tenantName && (
        <p className="text-sm text-gray-600 mb-2 pb-2 border-b">
          <strong>Tenant:</strong> {tenantName}
        </p>
      )}

      {error && (
        <div className="alert alert-danger" role="alert">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div>
        <TextField
          label="Display Name"
          required
          placeholder="e.g., Production Integration, Mobile App Key"
          value={displayName}
          onChange={(value) => setDisplayName(value)}
          disabled={loading}
          description="A friendly name to identify this key"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold mb-2">Description (optional)</label>
        <textarea
          placeholder="What is this key for? e.g., Used by our mobile app for push notifications"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
          rows={3}
          className="form-control"
        />
        <p className="text-xs text-gray-500 mt-1">Internal note about this key&apos;s purpose</p>
      </div>

      <div className="alert alert-info" role="alert">
        <strong>One-time Display:</strong> The API key will be shown only once after generation.
        Make sure to copy and store it securely.
      </div>
    </GenericModal>
  )
}

export default GenerateApiKeyModal
