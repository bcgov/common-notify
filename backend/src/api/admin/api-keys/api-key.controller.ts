import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  HttpCode,
  Query,
  UseGuards,
  Request,
  Logger,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { NotifyAdminGuard } from '../../../common/guards/notify-admin.guard'
import { Roles } from '../../../common/decorators/roles.decorator'
import { SsoRole } from '../../../enum/sso-role.enum'
import { ApiKeyService } from './api-key.service'
import { GenerateApiKeyDto } from './schemas/generate-api-key.dto'
import { ApiKeyGeneratedResponseDto, ApiKeyResponseDto } from './schemas/api-key-response.dto'

/**
 * API Key Management Controller
 *
 * Provides endpoints for tenants to manage their API keys:
 * - Generate new keys
 * - List existing keys
 * - Revoke keys
 *
 * Authorization: All endpoints require NOTIFY_ADMIN SSO role.
 */
@Controller({ path: 'admin/tenants/:tenantId/api-keys', version: '1' })
@ApiTags('API Key Management')
@UseGuards(NotifyAdminGuard)
@ApiBearerAuth('bearer')
export class ApiKeyController {
  private readonly logger = new Logger(ApiKeyController.name)

  constructor(private apiKeyService: ApiKeyService) {}

  /**
   * Generate a new API key for the tenant.
   *
   * POST /api/v1/admin/tenants/{tenantId}/api-keys
   *
   * Returns the key value exactly once - users must copy it immediately.
   * The key is never displayed again for security reasons.
   */
  @Post()
  @Roles(SsoRole.NOTIFY_ADMIN)
  @HttpCode(201)
  @ApiOperation({
    summary: 'Generate a new API key',
    description:
      'Creates a new API key for the tenant. The key value is returned once in this response and never shown again.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID' })
  @ApiResponse({
    status: 201,
    description: 'API key successfully generated',
    type: ApiKeyGeneratedResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({ status: 500, description: 'Failed to generate key' })
  async generateKey(
    @Param('tenantId') tenantId: string,
    @Body() dto: GenerateApiKeyDto,
    @Request() req: any,
  ): Promise<ApiKeyGeneratedResponseDto> {
    // TODO: Extract user ID from request once auth guards are added
    const userId = req.user?.id || 'system'

    this.logger.debug(`Generating API key for tenant ${tenantId} by user ${userId}`)
    return this.apiKeyService.generateKey(tenantId, dto, userId)
  }

  /**
   * List API keys for the tenant.
   *
   * GET /api/v1/admin/tenants/{tenantId}/api-keys
   *
   * Returns key metadata without exposing the actual key values.
   */
  @Get()
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({
    summary: 'List API keys for tenant',
    description:
      'Retrieves all API keys (active and revoked) for the specified tenant. Actual key values are never returned.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID' })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'List of API keys',
    schema: {
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/ApiKeyResponseDto' } },
        total: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async listKeys(
    @Param('tenantId') tenantId: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ): Promise<{ data: ApiKeyResponseDto[]; total: number }> {
    this.logger.debug(`Listing API keys for tenant ${tenantId}`)
    return this.apiKeyService.listKeys(tenantId, {
      activeOnly: activeOnly === 'true',
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 100,
    })
  }

  /**
   * Get details of a specific API key.
   *
   * GET /api/v1/admin/tenants/{tenantId}/api-keys/{keyId}
   *
   * Returns metadata about the key (creation date, usage count, etc.) without the key value.
   */
  @Get(':keyId')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({
    summary: 'Get API key details',
    description:
      'Retrieves metadata about a specific API key. The actual key value is never returned.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID' })
  @ApiParam({ name: 'keyId', description: 'API Key UUID' })
  @ApiResponse({
    status: 200,
    description: 'API key details',
    type: ApiKeyResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'API key or tenant not found' })
  async getKey(
    @Param('tenantId') tenantId: string,
    @Param('keyId') keyId: string,
  ): Promise<ApiKeyResponseDto> {
    this.logger.debug(`Getting API key ${keyId} for tenant ${tenantId}`)
    return this.apiKeyService.getKey(tenantId, keyId)
  }

  /**
   * Revoke an API key.
   *
   * DELETE /api/v1/admin/tenants/{tenantId}/api-keys/{keyId}
   *
   * Removes the key from Kong and marks it as revoked in the database.
   * The key can no longer be used for authentication immediately after revocation.
   */
  @Delete(':keyId')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @HttpCode(204)
  @ApiOperation({
    summary: 'Revoke an API key',
    description:
      'Revokes the specified API key. The key is immediately removed from Kong and marked as revoked in the database. It can no longer be used for authentication.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID' })
  @ApiParam({ name: 'keyId', description: 'API Key UUID' })
  @ApiResponse({
    status: 204,
    description: 'API key successfully revoked',
  })
  @ApiResponse({ status: 400, description: 'Key already revoked or invalid' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'API key or tenant not found' })
  @ApiResponse({ status: 500, description: 'Failed to revoke key' })
  async revokeKey(
    @Param('tenantId') tenantId: string,
    @Param('keyId') keyId: string,
    @Request() req: any,
  ): Promise<void> {
    // TODO: Extract user ID from request once auth guards are added
    const userId = req.user?.id || 'system'

    this.logger.debug(`Revoking API key ${keyId} for tenant ${tenantId} by user ${userId}`)
    return this.apiKeyService.revokeKey(tenantId, keyId, userId)
  }
}
