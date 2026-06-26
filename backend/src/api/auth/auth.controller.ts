import { Controller, Get, UseGuards, Req, HttpException, HttpStatus, Param } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth } from '@nestjs/swagger'
import { BearerTokenGuard } from '../../common/guards/bearer-token.guard'
import { CstarApiClient } from '../../services/cstar/cstar-api.client'
import { TenantsService } from '../admin/tenants/tenants.service'
import type Express from 'express'

/**
 * AuthController
 *
 * Provides authenticated user information including CSTAR tenants and roles.
 * Passes JWT directly to CSTAR - let CSTAR validate the token.
 */
@ApiTags('auth')
@Controller({ path: 'frontend/auth', version: '1' })
@UseGuards(BearerTokenGuard)
@ApiBearerAuth()
export class AuthController {
  constructor(
    private readonly cstarApiClient: CstarApiClient,
    private readonly tenantsService: TenantsService,
  ) {}

  /**
   * Get current user's CSTAR tenants
   *
   * GET /api/v1/frontend/auth/tenants
   *
   * Fetches the list of CSTAR tenants for the authenticated user and syncs them to the database.
   * This effectively "logs in" the user by ensuring their tenants are up-to-date in our system.
   * Extracts user ID from JWT and passes token to CSTAR.
   *
   * @param req Express request with Authorization header
   * @returns Object with tenants array
   */
  @Get('tenants')
  @ApiOperation({
    summary: 'Get current user tenants from CSTAR and sync to database',
    description:
      'Retrieves CSTAR tenants for authenticated user and upserts them into the database. Passes JWT directly to CSTAR.',
  })
  @ApiOkResponse({
    description: 'User tenants',
    schema: {
      example: {
        tenants: [
          { id: '123', name: 'Tenant A' },
          { id: '456', name: 'Tenant B' },
        ],
      },
    },
  })
  async getUserTenants(@Req() req: Express.Request) {
    try {
      // Extract JWT from Authorization header
      const authHeader = req.headers.authorization
      if (!authHeader) {
        throw new HttpException('Missing Authorization header', HttpStatus.UNAUTHORIZED)
      }

      // Extract user ID from JWT (without validating - let CSTAR do that)
      const token = authHeader.replace('Bearer ', '')
      let userId: string | undefined

      try {
        const parts = token.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
          userId = payload.idir_user_guid || payload.sub
        }
      } catch {
        throw new HttpException('Invalid JWT format', HttpStatus.UNAUTHORIZED)
      }

      if (!userId) {
        throw new HttpException('User ID not found in JWT', HttpStatus.UNAUTHORIZED)
      }

      const tenants = await this.cstarApiClient.getUserTenants(userId, authHeader)

      // Sync each tenant to the database (upsert)
      // This ensures the tenant is in the database and up-to-date
      for (const cstarTenant of tenants || []) {
        try {
          await this.tenantsService.upsertFromCstar(cstarTenant)
        } catch (error) {
          // Log sync error but continue - don't fail the entire request if one tenant fails
          console.error(`Failed to sync tenant ${cstarTenant.id}: ${error}`)
        }
      }

      return {
        tenants: tenants || [],
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      throw new HttpException(
        'Failed to fetch tenants from CSTAR',
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  /**
   * Get current user's CSTAR roles for a specific tenant
   *
   * GET /api/v1/frontend/auth/tenants/:tenantId/roles
   *
   * Fetches the list of CSTAR roles for the authenticated user in a specific tenant.
   *
   * @param req Express request with Authorization header
   * @param tenantId The CSTAR tenant ID
   * @returns Object with roles array
   */
  @Get('tenants/:tenantId/roles')
  @ApiOperation({
    summary: 'Get current user roles in a tenant',
    description: 'Retrieves user roles in a specific CSTAR tenant. Passes JWT directly to CSTAR.',
  })
  @ApiOkResponse({
    description: 'User roles in tenant',
    schema: {
      example: {
        roles: ['NOTIFY_VIEWER', 'NOTIFY_TEMPLATE_EDITOR'],
      },
    },
  })
  async getUserRoles(@Req() req: Express.Request, @Param('tenantId') tenantId: string) {
    try {
      // Extract JWT from Authorization header
      const authHeader = req.headers.authorization
      if (!authHeader) {
        throw new HttpException('Missing Authorization header', HttpStatus.UNAUTHORIZED)
      }

      // Extract user ID from JWT (without validating - let CSTAR do that)
      const token = authHeader.replace('Bearer ', '')
      let userId: string | undefined

      try {
        const parts = token.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
          userId = payload.idir_user_guid || payload.sub
        }
      } catch {
        throw new HttpException('Invalid JWT format', HttpStatus.UNAUTHORIZED)
      }

      if (!userId) {
        throw new HttpException('User ID not found in JWT', HttpStatus.UNAUTHORIZED)
      }

      if (!tenantId) {
        throw new HttpException('Tenant ID is required', HttpStatus.BAD_REQUEST)
      }

      const roles = await this.cstarApiClient.getUserRoles(tenantId, userId, authHeader)

      return {
        roles: roles || [],
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      throw new HttpException('Failed to fetch roles from CSTAR', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }
}
