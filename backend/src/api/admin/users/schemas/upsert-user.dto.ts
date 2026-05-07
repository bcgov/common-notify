import { IsString, IsEmail, IsOptional } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

/**
 * DTO for upserting a user
 * Extracted from JWT token claims via AuthUser
 */
export class UpsertUserDto {
  @ApiProperty({ description: 'External ID from identity provider (e.g., Keycloak user ID)' })
  @IsString()
  id: string

  @ApiProperty({ description: 'User email address', required: false })
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiProperty({ description: 'Display name from identity provider' })
  @IsString()
  displayName: string

  @ApiProperty({ description: 'Username from identity provider', required: false })
  @IsOptional()
  @IsString()
  username?: string

  @ApiProperty({ description: 'Given name', required: false })
  @IsOptional()
  @IsString()
  givenName?: string

  @ApiProperty({ description: 'Family name', required: false })
  @IsOptional()
  @IsString()
  familyName?: string
}
