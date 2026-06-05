import { Controller, Post, Get, Body, UseGuards, Logger, Req } from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { UsersService } from './users.service'
import { UpsertUserDto } from './schemas/upsert-user.dto'
import { UpsertUserResponseDto, UserResponseDto } from './schemas/user-response.dto'
import { JwtGuard } from '../../../common/guards/auth.jwt-guard'
import type Express from 'express'

/**
 * UsersController
 *
 * Handles user account management.
 * Users are upserted on first login (from JWT claims) and can be queried by authenticated users.
 */
@ApiTags('users')
@Controller({ path: 'frontend/users', version: '1' })
@UseGuards(JwtGuard)
@ApiBearerAuth()
export class UsersController {
  private readonly logger = new Logger(UsersController.name)

  constructor(private readonly usersService: UsersService) {}

  /**
   * Upsert current user (on first login or profile update)
   * Takes the authenticated user's info from JWT claims.
   *
   * POST /api/v1/frontend/users/me
   *
   * @param dto User data from JWT (external_id, email, displayName, etc.)
   * @param req Express request with JWT payload
   * @returns UpsertUserResponseDto with the user record and isNew flag
   */
  @Post('me')
  @ApiOperation({
    summary: 'Upsert current user',
    description:
      'Creates or updates the authenticated user record based on JWT claims. Called on login or profile refresh.',
  })
  @ApiCreatedResponse({
    description: 'User created or updated',
    type: UpsertUserResponseDto,
  })
  async upsertCurrentUser(@Body() dto: UpsertUserDto, @Req() req: Express.Request) {
    const jwtPayload = (req as any).user || {}
    const createdBy = jwtPayload.idir_username || jwtPayload.sub || jwtPayload.id || 'system'

    try {
      const result = await this.usersService.upsertUser(dto, createdBy)
      this.logger.debug(`Upsert successful:`, JSON.stringify(result))
      return result
    } catch (error) {
      this.logger.error(`Upsert failed:`, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  /**
   * Get all non-deleted users
   *
   * GET /api/v1/frontend/users
   *
   * @returns Array of UserResponseDto
   */
  @Get()
  @ApiOperation({
    summary: 'Get all users',
    description: 'Returns a list of all non-deleted users in the system.',
  })
  @ApiOkResponse({
    description: 'List of users',
    type: [UserResponseDto],
  })
  async getAllUsers(): Promise<{ users: UserResponseDto[]; count: number }> {
    this.logger.log('Fetching all users')
    const users = await this.usersService.findAll()
    return {
      users,
      count: users.length,
    }
  }
}
