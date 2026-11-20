import { Controller, Post, Get, UseGuards, Logger, Req } from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBearerAuth,
  ApiExcludeController,
} from '@nestjs/swagger'
import { UsersService } from './users.service'
import { UpsertUserDto } from './schemas/upsert-user.dto'
import { UpsertUserResponseDto, UserDirectoryEntryDto } from './schemas/user-response.dto'
import { AuthenticatedUserGuard } from '../../../common/guards/authenticated-user.guard'
import type Express from 'express'

/**
 * UsersController
 *
 * Handles user account management.
 * Users are upserted on first login (from verified JWT claims) and the directory can be
 * read by any authenticated user for name lookups.
 *
 * Guarded by AuthenticatedUserGuard: these routes require a signed-in Notify user but are
 * not tenant-scoped (the upsert runs at login, before a tenant is selected).
 */
@ApiTags('users')
// Not part of the service API; kept out of the published spec.
@ApiExcludeController()
@Controller({ path: 'frontend/users', version: '1' })
@UseGuards(AuthenticatedUserGuard)
@ApiBearerAuth()
export class UsersController {
  private readonly logger = new Logger(UsersController.name)

  constructor(private readonly usersService: UsersService) {}

  /**
   * Upsert current user (on first login or profile update).
   *
   * Identity is taken from the verified JWT claims on the request, never from the request
   * body — a caller cannot create or overwrite a record for an identity other than their
   * own. See SEC-6 in docs/security-findings-jira.md.
   *
   * POST /api/v1/frontend/users/me
   */
  @Post('me')
  @ApiOperation({
    summary: 'Upsert current user',
    description:
      'Creates or updates the authenticated user record from verified JWT claims. Called on login or profile refresh.',
  })
  @ApiCreatedResponse({
    description: 'User created or updated',
    type: UpsertUserResponseDto,
  })
  async upsertCurrentUser(@Req() req: Express.Request) {
    const claims = (req as any).user ?? {}
    const dto = this.userFromClaims(claims)
    const createdBy = claims.idir_username || claims.sub || 'system'

    try {
      const result = await this.usersService.upsertUser(dto, createdBy)
      this.logger.debug(`Upsert successful for externalId ${dto.id}`)
      return result
    } catch (error) {
      this.logger.error(`Upsert failed:`, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  /**
   * Get the user directory (id, externalId, displayName only).
   *
   * GET /api/v1/frontend/users
   */
  @Get()
  @ApiOperation({
    summary: 'Get the user directory',
    description:
      'Returns a minimal directory (id, external id, display name) of non-deleted users, for resolving created_by/updated_by ids to names.',
  })
  @ApiOkResponse({
    description: 'User directory',
    type: [UserDirectoryEntryDto],
  })
  async getAllUsers(): Promise<{ users: UserDirectoryEntryDto[]; count: number }> {
    const users = await this.usersService.findAll()
    return {
      users,
      count: users.length,
    }
  }

  /**
   * Map verified Keycloak/IDIR JWT claims to the upsert shape. Mirrors the frontend's own
   * claim mapping so the stored record matches what the signed-in user sees.
   */
  private userFromClaims(claims: Record<string, any>): UpsertUserDto {
    return {
      id: claims.idir_user_guid || claims.sub,
      email: claims.email,
      displayName: claims.display_name || claims.name || '',
      username: claims.idir_username,
      givenName: claims.given_name,
      familyName: claims.family_name,
    }
  }
}
