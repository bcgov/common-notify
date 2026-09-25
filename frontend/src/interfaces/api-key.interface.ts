/** How a key came to be bound to the tenant. */
export type ApiKeyIssuedVia = 'bind' | 'self-service'

/**
 * An API key bound to the tenant, as returned by GET /api/v1/frontend/api-keys.
 *
 * Never carries the key value: Notify does not store it. `clientId` is what the UI
 * shows as the API key label.
 */
export interface ApiKey {
  id: string
  clientId?: string
  notes: string | null
  issuedVia: ApiKeyIssuedVia
  issuedAt?: string
  lastRegeneratedAt?: string
  /** When the value the tenant currently holds was created — this is the "Created on". */
  currentKeyCreatedAt?: string
  issuedByIdirGuid?: string
  /** False until the key has been used at least once. */
  activated: boolean
  /**
   * False for keys bound through the legacy Postman flow. They still authenticate, but
   * carry no gateway clientId, so Notify has no handle to rotate or annotate them.
   */
  manageable: boolean
  createdAt: string
}

/**
 * The response to issuing or regenerating.
 *
 * `apiKey` is present exactly once, here. It cannot be retrieved afterwards, which is
 * why the dialog that shows it says so.
 */
export interface IssuedApiKey extends ApiKey {
  apiKey: string
  flow: string
}
