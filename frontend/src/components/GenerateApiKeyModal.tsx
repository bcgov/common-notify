import { useState } from 'react'
import type { FC } from 'react'
import {
  Button,
  Modal,
  Input,
  TextArea,
  Loading,
  Alert,
} from '@bcgov/design-system-react-components'
import {
  apiKeyService,
  type GenerateApiKeyRequest,
  type GeneratedApiKeyResponse,
} from '@/api/apiKeyService'

interface GenerateApiKeyModalProps {
  tenantId: string
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
      setError(err.response?.data?.message || 'Failed to generate API key. Please try again.')
      console.error('Failed to generate API key:', err)
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
      <Modal isOpen={isOpen} onClose={handleClose} title="API Key Generated">
        <div className="space-y-4">
          <Alert type="success" title="API Key successfully created">
            Copy the key below. You won't be able to see it again for security reasons.
          </Alert>

          <div className="bg-gray-50 p-4 rounded border border-gray-200">
            <p className="text-sm font-semibold text-gray-700 mb-2">API Key:</p>
            <div className="flex gap-2">
              <code className="flex-1 text-sm break-all font-mono bg-white p-2 rounded border">
                {generatedKey.key}
              </code>
              <Button
                variant="secondary"
                onClick={() => {
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

          <Alert type="info" title="Important">
            Store this key securely. Include it in your API requests as:
            <code className="block text-xs bg-white p-2 rounded mt-2">
              X-API-KEY: {generatedKey.key}
            </code>
          </Alert>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSuccess}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    )
  }

  // Show form for generating new key
  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Generate New API Key">
      {loading && <Loading message="Generating API key..." />}

      {error && (
        <Alert type="error" title="Error">
          {error}
        </Alert>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold mb-2">Display Name *</label>
          <Input
            type="text"
            placeholder="e.g., Production Integration, Mobile App Key"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={loading}
          />
          <p className="text-xs text-gray-500 mt-1">A friendly name to identify this key</p>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2">Description (optional)</label>
          <TextArea
            placeholder="What is this key for? e.g., Used by our mobile app for push notifications"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={loading}
            rows={3}
          />
          <p className="text-xs text-gray-500 mt-1">Internal note about this key's purpose</p>
        </div>

        <Alert type="info" title="One-time Display">
          The API key will be shown only once after generation. Make sure to copy and store it
          securely.
        </Alert>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleGenerateKey}
            disabled={loading || !displayName.trim()}
          >
            Generate Key
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default GenerateApiKeyModal
