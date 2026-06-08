import { useEffect, useState, forwardRef, useCallback } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import { Table } from '@/components/DataTable/Table'
import { apiKeyService, type ApiKeyResponse, type ApiKeysListResponse } from '@/api/apiKeyService'

interface ApiKeyListProps {
  tenantId: string
  onRevokeSuccess?: () => void
}

/**
 * API Key List Component
 * Displays all API keys for a tenant with ability to revoke them
 */
const ApiKeyList = forwardRef<{ refetch?: () => void }, ApiKeyListProps>(
  ({ tenantId, onRevokeSuccess }, ref) => {
    const [keys, setKeys] = useState<ApiKeyResponse[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [revoking, setRevoking] = useState<string | null>(null)

    const fetchKeys = useCallback(async () => {
      setLoading(true)
      setError(null)

      try {
        const response: ApiKeysListResponse = await apiKeyService.listKeys(tenantId)
        setKeys(response.data)
      } catch (err: any) {
        console.error('Failed to fetch API keys:', err)
        setError('Failed to load API keys. Please try again.')
      } finally {
        setLoading(false)
      }
    }, [tenantId])

    // Expose refetch method via ref
    useEffect(() => {
      if (typeof ref === 'function') {
        ref({ refetch: fetchKeys })
      } else if (ref) {
        ref.current = { refetch: fetchKeys }
      }
    }, [ref, fetchKeys])

    const handleRevokeKey = async (keyId: string) => {
      if (!confirm('Are you sure you want to revoke this API key? It can no longer be used.')) {
        return
      }

      setRevoking(keyId)

      try {
        await apiKeyService.revokeKey(tenantId, keyId)
        setKeys(keys.filter((k) => k.id !== keyId))
        onRevokeSuccess?.()
      } catch (err: any) {
        console.error('Failed to revoke API key:', err)
        alert('Failed to revoke API key. Please try again.')
      } finally {
        setRevoking(null)
      }
    }

    useEffect(() => {
      fetchKeys()
    }, [fetchKeys])

    if (loading) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
          Loading API keys...
        </div>
      )
    }

    if (error) {
      return (
        <div className="alert alert-danger" role="alert">
          <strong>Error:</strong> {error}
        </div>
      )
    }

    if (keys.length === 0) {
      return (
        <div className="alert alert-info" role="alert">
          <strong>No API Keys:</strong> No API keys have been generated yet. Click the button above
          to create one.
        </div>
      )
    }

    return (
      <div>
        <Table variant="striped" size="md">
          <thead>
            <tr>
              <th>Display Name</th>
              <th>Description</th>
              <th>Usage Count</th>
              <th>Last Used</th>
              <th>Created</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.id}>
                <td className="font-semibold">{key.displayName}</td>
                <td>{key.description || '-'}</td>
                <td>{key.usageCount}</td>
                <td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}</td>
                <td>{new Date(key.createdAt).toLocaleDateString()}</td>
                <td>
                  {key.isActive ? (
                    <span className="inline-block bg-green-100 text-green-800 px-2 py-1 rounded text-sm">
                      Active
                    </span>
                  ) : (
                    <span className="inline-block bg-red-100 text-red-800 px-2 py-1 rounded text-sm">
                      Revoked
                    </span>
                  )}
                </td>
                <td>
                  {key.isActive && (
                    <Button
                      variant="primary"
                      onPress={() => handleRevokeKey(key.id)}
                      isDisabled={revoking === key.id}
                    >
                      {revoking === key.id ? 'Revoking...' : 'Revoke'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    )
  },
)

ApiKeyList.displayName = 'ApiKeyList'

export default ApiKeyList
