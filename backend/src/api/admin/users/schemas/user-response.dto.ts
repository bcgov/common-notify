import { ApiProperty } from '@nestjs/swagger'

/**
 * DTO for user response
 * Returns the internal notify_user record details
 */
export class UserResponseDto {
  @ApiProperty({ description: 'Internal UUID for this user' })
  id: string

  @ApiProperty({ description: 'External ID from identity provider' })
  externalId: string

  @ApiProperty({ description: 'Display name (full name) from identity provider' })
  displayName: string

  @ApiProperty({ description: 'Email address' })
  email: string

  @ApiProperty({ description: 'Username from identity provider' })
  username: string

  @ApiProperty({ description: 'Given name (first name)' })
  givenName: string

  @ApiProperty({ description: 'Family name (last name)' })
  familyName: string

  @ApiProperty({ description: 'Timestamp when user was created' })
  createdAt: Date

  @ApiProperty({ description: 'User or system that created this record' })
  createdBy: string

  @ApiProperty({ description: 'Timestamp when user was last updated' })
  updatedAt: Date

  @ApiProperty({ description: 'User or system that last updated this record' })
  updatedBy: string

  @ApiProperty({ description: 'Soft delete flag' })
  isDeleted: boolean
}

/**
 * Response when upserting a user
 */
export class UpsertUserResponseDto {
  @ApiProperty({ description: 'The upserted user' })
  user: UserResponseDto

  @ApiProperty({ description: 'Whether this was a new creation (true) or update (false)' })
  isNew: boolean

  @ApiProperty({ description: 'Result message' })
  message: string
}
