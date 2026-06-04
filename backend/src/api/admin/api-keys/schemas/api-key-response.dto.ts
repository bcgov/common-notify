/**
 * Response DTO for newly generated API key.
 * Includes the actual key value (shown only once to the user).
 */
export class ApiKeyGeneratedResponseDto {
  id: string
  tenantId: string
  displayName: string
  description?: string
  /**
   * The actual API key value.
   * IMPORTANT: This is shown only once. After this response, the key is never displayed again.
   * User should copy/save this immediately.
   */
  key: string
  createdAt: Date
  createdBy: string
  rateLimitConfig?: Record<string, any>
}

/**
 * Response DTO for API key details (without the actual key value).
 * Used when listing or retrieving existing keys.
 */
export class ApiKeyResponseDto {
  id: string
  tenantId: string
  displayName: string
  description?: string
  usageCount: number
  lastUsedAt?: Date
  createdAt: Date
  createdBy: string
  revokedAt?: Date
  revokedBy?: string
  rateLimitConfig?: Record<string, any>
  /**
   * Computed field: whether the key is currently active.
   */
  isActive: boolean
}

/**
 * Response DTO for listing API keys.
 */
export class ApiKeyListResponseDto {
  data: ApiKeyResponseDto[]
  total: number
}
