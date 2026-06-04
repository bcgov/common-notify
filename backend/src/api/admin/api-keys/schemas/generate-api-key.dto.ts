/**
 * Request DTO for generating a new API key.
 */
export class GenerateApiKeyDto {
  /**
   * User-friendly display name for the API key.
   * E.g., "Production Integration", "Mobile App Key"
   */
  displayName: string

  /**
   * Optional description of the key's purpose.
   */
  description?: string

  /**
   * Optional rate limit configuration.
   * Format example: { "tier": "standard", "rpm": 100 }
   */
  rateLimitConfig?: Record<string, any>
}
