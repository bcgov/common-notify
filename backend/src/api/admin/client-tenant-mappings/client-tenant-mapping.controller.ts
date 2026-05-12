import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Headers,
  UseGuards,
  HttpException,
  Logger,
  Req,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { ClientTenantMappingService } from './client-tenant-mapping.service'
import { LinkClientToTenantsDto } from './schemas/link-client-to-tenants.dto'
import { LinkClientToTenantsResponseDto } from './schemas/link-client-to-tenants-response.dto'
import { AuthJwtGuard } from '../../../auth/guards/auth.jwt-guard'
import { RoleGuard } from '../../../auth/guards/role.guard'
import { RequireRole } from '../../../auth/decorators/require-role.decorator'
import type Express from 'express'

/**
 * ClientTenantMappingController
 *
 * Handles linking API Gateway client IDs to CSTAR tenants.
 * This is an admin-only endpoint that enables service-to-service authentication.
 *
 * Security:
 * - Requires NOTIFY_ADMIN role
 * - Client secret is used only for OAuth2 token exchange (never stored)
 * - Client ID is extracted from token claims as proof of ownership
 * - Admin selection of tenants proves ownership of CSTAR tenants
 */
@ApiTags('admin')
@Controller({ path: 'frontend/admin/clients', version: '1' })
@UseGuards(AuthJwtGuard, RoleGuard)
@ApiBearerAuth()
export class ClientTenantMappingController {
  private readonly logger = new Logger(ClientTenantMappingController.name)

  constructor(
    private readonly mappingService: ClientTenantMappingService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Link an API Gateway client to one or more tenants
   *
   * Security flow:
   * 1. Admin submits client_id and client_secret (from API Portal)
   * 2. Backend exchanges credentials for OAuth2 token (proves client ownership)
   * 3. Backend extracts client_id from token claims
   * 4. Admin selects which tenants should use this client
   * 5. Mapping is created in database (secret is never stored)
   *
   * @param dto Contains client_id, client_secret, and tenant_ids
   * @param req Express request (used to extract admin user GUID from JWT)
   * @returns Confirmation with created mappings
   */
  @Post('link-to-tenants')
  @RequireRole('NOTIFY_ADMIN')
  @ApiOperation({
    summary: 'Link an API Gateway client to CSTAR tenants',
    description:
      'Admin endpoint to authorize an API Portal client for use with specific tenants. ' +
      'Requires client credentials from API Portal and NOTIFY_ADMIN role. ' +
      'Client secret is used only for verification and is never stored.',
  })
  @ApiCreatedResponse({
    type: LinkClientToTenantsResponseDto,
    description: 'Client successfully linked to tenants',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid Bearer token',
  })
  @ApiForbiddenResponse({
    description: 'User does not have NOTIFY_ADMIN role',
  })
  @ApiBadRequestResponse({
    description: 'Invalid client credentials, non-existent tenants, or duplicate mapping',
  })
  async linkClientToTenants(
    @Body() dto: LinkClientToTenantsDto,
    @Req() req: Express.Request & { user?: { sub: string; [key: string]: any } },
  ): Promise<LinkClientToTenantsResponseDto> {
    try {
      // Extract admin user GUID from JWT token
      const user = req.user
      if (!user || !user.sub) {
        this.logger.error('Unable to extract user information from JWT')
        throw new HttpException('Unable to identify authenticated user', 401)
      }
      const adminUserGuid = user.sub

      // Exchange credentials for OAuth2 token to verify client ownership
      const clientId = await this.verifyClientOwnership(dto.client_id, dto.client_secret)

      // Ensure the extracted client_id matches what was submitted (sanity check)
      if (clientId !== dto.client_id) {
        this.logger.warn(
          `Client ID mismatch: submitted=${dto.client_id}, token=${clientId}. Possible credential misuse.`,
        )
        throw new HttpException(
          'Client credentials do not match the provided client_id. Possible credential misuse.',
          400,
        )
      }

      // Create the mappings
      const mappings = await this.mappingService.linkClientToTenants(
        clientId,
        dto.tenant_ids,
        adminUserGuid,
      )

      this.logger.debug(
        `Successfully linked client ${clientId} to ${mappings.length} tenant(s) by admin ${adminUserGuid}`,
      )

      return {
        mappings: mappings.map((m) => ({
          id: m.id,
          client_id: m.clientId,
          tenant_id: m.tenantId,
          is_active: m.isActive,
          created_at: m.createdAt.toISOString(),
          created_by: m.createdBy,
          updated_at: m.updatedAt.toISOString(),
          updated_by: m.updatedBy,
          is_deleted: m.isDeleted,
        })),
        message: `Successfully linked client ${clientId} to ${mappings.length} tenant(s)`,
        count: mappings.length,
      }
    } catch (error) {
      this.logger.error(`Error linking client to tenants: ${error.message}`, error.stack)

      // Format validation errors to show individual field errors
      if (error.getStatus && error.getStatus() === 400) {
        const response = error.getResponse() as any
        if (response.message && Array.isArray(response.message)) {
          const fieldErrors = response.message.map((msg: string) => `- ${msg}`).join('\n')
          this.logger.error(`Validation errors:\n${fieldErrors}`)
        }
      }

      throw error
    }
  }

  /**
   * Get all client-tenant mappings
   * @returns List of all mappings
   */
  @Get('mappings')
  @ApiOperation({
    summary: 'Get all client-tenant mappings',
    description: 'List all active and inactive client-tenant mappings',
  })
  @ApiOkResponse({
    description: 'List of mappings returned successfully',
  })
  async getAllMappings() {
    const mappings = await this.mappingService.findAll()
    return {
      mappings: mappings.map((m) => ({
        id: m.id,
        client_id: m.clientId,
        tenant_id: m.tenantId,
        tenant_name: m.tenant?.name || m.tenantId,
        is_active: m.isActive,
        created_at: m.createdAt.toISOString(),
        created_by: m.createdBy,
        updated_at: m.updatedAt.toISOString(),
        updated_by: m.updatedBy,
      })),
      count: mappings.length,
    }
  }

  /**
   * Toggle mapping active status
   * Mapping ID is extracted from X-Mapping-ID header
   * @param mappingId Mapping ID (from header)
   * @param req Express request
   * @returns Updated mapping
   */
  @Patch('mappings')
  @RequireRole('NOTIFY_ADMIN')
  @ApiOperation({
    summary: 'Toggle client-tenant mapping active status',
    description: 'Enable or disable a client-tenant mapping without deleting it',
  })
  @ApiOkResponse({
    description: 'Mapping status updated successfully',
  })
  @ApiBadRequestResponse({
    description: 'Invalid mapping ID or mapping not found',
  })
  async toggleMappingActive(
    @Headers('x-mapping-id') mappingId: string,
    @Req() req: Express.Request & { user?: { sub: string; [key: string]: any } },
  ) {
    if (!mappingId) {
      this.logger.error('Missing X-Mapping-ID header')
      throw new HttpException('Missing X-Mapping-ID header', 400)
    }

    const user = req.user
    if (!user || !user.sub) {
      this.logger.error('Unable to extract user information from JWT')
      throw new HttpException('Unable to identify authenticated user', 401)
    }

    const mapping = await this.mappingService.toggleActiveStatus(mappingId, user.sub)

    return {
      mapping: {
        id: mapping.id,
        client_id: mapping.clientId,
        tenant_id: mapping.tenantId,
        is_active: mapping.isActive,
        created_at: mapping.createdAt.toISOString(),
        created_by: mapping.createdBy,
        updated_at: mapping.updatedAt.toISOString(),
        updated_by: mapping.updatedBy,
      },
      message: `Mapping ${mapping.isActive ? 'enabled' : 'disabled'} successfully`,
    }
  }

  /**
   * Verify client ownership by exchanging credentials for an OAuth2 token
   * Returns the client_id extracted from the token claims
   *
   * @param clientId The submitted client_id
   * @param clientSecret The client secret from API Portal
   * @returns The client_id from the token claims
   * @throws HttpException if token exchange fails or credentials are invalid
   */
  private async verifyClientOwnership(clientId: string, clientSecret: string): Promise<string> {
    const tokenUrl = process.env.GATEWAY_OAUTH2_TOKEN_URL

    if (!tokenUrl) {
      this.logger.error('GATEWAY_OAUTH2_TOKEN_URL not configured')
      throw new HttpException(
        'OAuth2 service not properly configured. Contact system administrator.',
        500,
      )
    }

    try {
      const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      })

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })

      if (!response.ok) {
        const errorText = await response.text()
        this.logger.warn(
          `OAuth2 token exchange failed for client ${clientId}: ${response.status} - ${errorText}`,
        )

        // Return 401 if credentials are invalid (not 500)
        if (response.status === 401 || response.status === 400) {
          throw new HttpException(
            'Invalid client credentials. Please verify your client_id and client_secret from the API Portal.',
            400,
          )
        }

        throw new HttpException(
          `OAuth2 token exchange failed: ${response.status}. Contact system administrator.`,
          500,
        )
      }

      const data = (await response.json()) as {
        access_token: string
        expires_in?: number
      }

      if (!data.access_token) {
        this.logger.error('OAuth2 response missing access_token')
        throw new HttpException('OAuth2 service returned invalid response', 500)
      }

      // Decode the JWT token to extract claims
      // JWT format: header.payload.signature
      const parts = data.access_token.split('.')
      if (parts.length !== 3) {
        this.logger.error('Invalid JWT token format from OAuth2 response')
        throw new HttpException('OAuth2 service returned invalid token', 500)
      }

      try {
        // Decode the payload (second part)
        // Add padding if needed
        let payload = parts[1]
        const padding = 4 - (payload.length % 4)
        if (padding !== 4) {
          payload += '='.repeat(padding)
        }

        const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'))

        // Extract client_id from token claims
        // API Gateway JWT typically uses 'azp' (authorized party) or 'client_id' claim
        const extractedClientId =
          decodedPayload.azp || decodedPayload.client_id || decodedPayload.sub

        if (!extractedClientId) {
          this.logger.error('Client ID not found in OAuth2 token claims')
          throw new HttpException(
            'OAuth2 token missing client_id. OAuth2 service misconfigured. Contact system administrator.',
            500,
          )
        }

        this.logger.debug(`OAuth2 token verified for client ${extractedClientId}`)
        return extractedClientId as string
      } catch (decodeError) {
        this.logger.error(`Failed to decode OAuth2 token: ${decodeError.message}`)
        throw new HttpException('Failed to verify client credentials', 500)
      }
    } catch (error) {
      // Re-throw HttpExceptions as-is
      if (error instanceof HttpException) {
        throw error
      }
      // Wrap other errors
      this.logger.error(`Unexpected error during OAuth2 verification: ${error.message}`)
      throw new HttpException(
        'Failed to verify client credentials. Contact system administrator.',
        500,
      )
    }
  }
}
