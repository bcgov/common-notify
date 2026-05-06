import { IsString, IsArray, IsUUID, ArrayMinSize, Matches } from 'class-validator'
import { Transform } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'

/**
 * LinkClientToTenantsDto
 *
 * Request schema for linking an API Gateway client ID to one or more CSTAR tenants.
 * The client must prove ownership of credentials via OAuth2 exchange before mapping is created.
 */
export class LinkClientToTenantsDto {
  @ApiProperty({
    description:
      'API Gateway client ID issued via API Portal. Must match the client_id in the OAuth token after credential exchange.',
    example: 'abc123def456',
  })
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return String(value).trim()
    }
    return value.trim()
  })
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'client_id must contain only alphanumeric characters, dots, hyphens, and underscores',
  })
  client_id: string

  @ApiProperty({
    description:
      'API Gateway client secret. Used for one-time OAuth2 token exchange to prove client ownership. Never stored in database.',
    example: 'super-secret-credentials',
  })
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return String(value)
    }
    return value
  })
  @IsString()
  client_secret: string

  @ApiProperty({
    description: 'Array of CSTAR tenant UUIDs this client should have access to.',
    example: ['550e8400-e29b-41d4-a716-446655440000', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'],
    type: [String],
  })
  @Transform(({ value }) => {
    // Ensure it's always an array
    if (!Array.isArray(value)) {
      if (typeof value === 'string') {
        return [value]
      }
      return []
    }
    return value
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  tenant_ids: string[]
}
