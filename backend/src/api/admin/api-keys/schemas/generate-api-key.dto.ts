import { IsString, IsOptional, IsNotEmpty } from 'class-validator'
import { Expose } from 'class-transformer'

/**
 * Request DTO for generating a new API key.
 */
export class GenerateApiKeyDto {
  /**
   * User-friendly display name for the API key.
   * E.g., "Production Integration", "Mobile App Key"
   */
  @Expose()
  @IsString()
  @IsNotEmpty({ message: 'Display name is required' })
  displayName: string

  /**
   * Optional description of the key's purpose.
   */
  @Expose()
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string

  /**
   * Optional rate limit configuration.
   * Format example: { "tier": "standard", "rpm": 100 }
   */
  @Expose()
  @IsOptional()
  rateLimitConfig?: Record<string, any>
}
