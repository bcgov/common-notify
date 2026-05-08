import {
  IsString,
  IsArray,
  ArrayMinSize,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { Transform, Type } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'

/**
 * Represents a tenant reference with both CSTAR ID and name
 */
export class TenantReference {
  @ApiProperty({
    description: 'CSTAR tenant ID (UUID string)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  id: string

  @ApiProperty({
    description: 'Tenant name from CSTAR',
    example: 'Ministry of Health',
  })
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return String(value).trim()
    }
    return value.trim()
  })
  @IsString()
  name: string
}

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
  @MinLength(1, { message: 'client_id cannot be empty' })
  @MaxLength(128, { message: 'client_id must not exceed 128 characters' })
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
  @MinLength(1, { message: 'client_secret cannot be empty' })
  @MaxLength(256, { message: 'client_secret must not exceed 256 characters' })
  client_secret: string

  @ApiProperty({
    description: 'Array of CSTAR tenants (with ID and name) this client should have access to.',
    example: [
      { id: '550e8400-e29b-41d4-a716-446655440000', name: 'Ministry of Health' },
      { id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', name: 'Ministry of Finance' },
    ],
    type: [TenantReference],
  })
  @Transform(({ value }) => {
    // Ensure it's always an array
    if (!Array.isArray(value)) {
      return []
    }
    return value
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TenantReference)
  tenant_ids: TenantReference[]
}
