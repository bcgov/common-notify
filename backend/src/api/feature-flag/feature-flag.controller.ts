import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  Logger,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Version,
} from '@nestjs/common'
import type { Request } from 'express'
import { FeatureFlagService } from './feature-flag.service'
import { CreateFeatureFlagDto } from './schemas/create-feature-flag.dto'
import { UpdateFeatureFlagDto } from './schemas/update-feature-flag.dto'
import { FeatureFlag } from './entities/feature-flag.entity'
import { NotifyAdminGuard } from '../../common/guards/notify-admin.guard'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { NotifyServiceGuard } from '../../common/guards/notify-service.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { SsoRole } from '../../enum/sso-role.enum'
import { ApiExcludeController } from '@nestjs/swagger'

/**
 * Feature Flag Controller
 *
 * Admin routes for managing feature flags (enable/disable features without redeployment)
 * All admin routes require NOTIFY_ADMIN role for security.
 *
 * Admin Routes (require NOTIFY_ADMIN):
 * - POST   /api/v1/frontend/admin/feature-flags           Create a new flag
 * - GET    /api/v1/frontend/admin/feature-flags           List all flags (global + overrides)
 * - PATCH  /api/v1/frontend/admin/feature-flags/:id       Toggle flag enabled/disabled
 * - DELETE /api/v1/frontend/admin/feature-flags/:id       Not Implemented (disable flags instead)
 *
 * Client Route (any authenticated user):
 * - GET    /api/v1/feature-flags                          Get feature flags for user's tenant
 */
// Not part of the service API; kept out of the published spec.
@ApiExcludeController()
@Controller('frontend/admin/feature-flags')
@UseGuards(NotifyAdminGuard)
export class FeatureFlagController {
  private readonly logger = new Logger(FeatureFlagController.name)

  constructor(private readonly featureFlagService: FeatureFlagService) {}

  /**
   * Create a new feature flag (global or tenant-specific)
   * ADMIN ONLY - requires NOTIFY_ADMIN role
   *
   * Example request body:
   * {
   *   "code": "sms_notifications",
   *   "enabled": true,
   *   "tenantId": "550e8400-e29b-41d4-a716-446655440000"  // optional, null for global
   * }
   */
  @Version('1')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @Post()
  async create(@Body() dto: CreateFeatureFlagDto): Promise<FeatureFlag> {
    try {
      // Validate code format
      if (!dto.code || dto.code.trim().length === 0) {
        throw new BadRequestException('Feature code is required and cannot be empty')
      }

      // Check if flag already exists (code + tenantId combination)
      const existing = await this.featureFlagService.getByCodeAndTenant(dto.code, dto.tenantId)
      if (existing) {
        throw new BadRequestException(
          `Feature flag for code "${dto.code}" already exists${dto.tenantId ? ' for this tenant' : ' globally'}`,
        )
      }

      // TODO: In production, extract userId from request context (JWT token)
      const userId = 'admin-user' // placeholder

      const flag = await this.featureFlagService.create(dto, userId)
      this.logger.log(`Created feature flag: ${flag.code} (enabled: ${flag.enabled})`)
      return flag
    } catch (error) {
      this.logger.error('Error creating feature flag', error)
      throw error
    }
  }

  /**
   * Get all feature flags (global + all tenant overrides)
   * ADMIN ONLY - requires NOTIFY_ADMIN role
   * Useful for admin dashboard to see all configurations
   */
  @Version('1')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @Get()
  async getAll(): Promise<FeatureFlag[]> {
    return this.featureFlagService.getAll()
  }

  /**
   * Update a feature flag (toggle enabled/disabled)
   * ADMIN ONLY - requires NOTIFY_ADMIN role
   *
   * Example request body:
   * {
   *   "enabled": false
   * }
   */
  @Version('1')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateFeatureFlagDto): Promise<FeatureFlag> {
    try {
      // Validate ID format
      if (!id || id.trim().length === 0) {
        throw new BadRequestException('Feature flag ID is required')
      }

      // Check if flag exists
      const flag = await this.featureFlagService.getById(id)
      if (!flag) {
        throw new NotFoundException(`Feature flag with ID "${id}" not found`)
      }

      // TODO: In production, extract userId from request context (JWT token)
      const userId = 'admin-user' // placeholder

      const updated = await this.featureFlagService.update(id, dto, userId)
      this.logger.log(`Updated feature flag: ${updated.code} (enabled: ${updated.enabled})`)
      return updated
    } catch (error) {
      this.logger.error('Error updating feature flag', error)
      throw error
    }
  }

  /**
   * Delete a feature flag - NOT IMPLEMENTED
   * Feature flags should be disabled (via PATCH) rather than deleted.
   * This endpoint is intentionally not implemented to prevent accidental removal of flags.
   */
  @Version('1')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @Delete(':id')
  async delete(@Param('id') _id: string): Promise<never> {
    throw new HttpException(
      {
        error: 'Not Implemented',
        message:
          'Feature flag deletion is not supported. Please disable the flag instead using the update (PATCH) endpoint.',
        statusCode: HttpStatus.NOT_IMPLEMENTED,
      },
      HttpStatus.NOT_IMPLEMENTED,
    )
  }
}

/**
 * Client Feature Flags Controller
 * Routes for getting feature flags for the current user's tenant
 * Available to any authenticated user
 */
// Not part of the service API; kept out of the published spec.
@ApiExcludeController()
@Controller('feature-flags')
@UseGuards(NotifyServiceGuard)
export class FeatureFlagClientController {
  private readonly logger = new Logger(FeatureFlagClientController.name)

  constructor(private readonly featureFlagService: FeatureFlagService) {}

  /**
   * Get feature flags for the current user's tenant
   * ANY AUTHENTICATED USER - Uses tenant context from NotifyServiceGuard
   *
   * Tenant validation:
   * 1. Client sends X-Tenant-ID header
   * 2. NotifyServiceGuard validates tenant and client mapping
   * 3. NotifyServiceGuard sets request.tenant with validated tenant info
   * 4. This endpoint uses request.tenant.id
   *
   * Returns a map of feature codes to enabled status
   * Takes into account tenant-specific overrides and global flags
   *
   * Example response:
   * {
   *   "sms_notifications": true,
   *   "sse_notifications": true,
   *   "dashboard": false
   * }
   */
  @Version('1')
  @Get()
  async getForTenant(@Req() req: Request): Promise<Record<string, boolean>> {
    try {
      // Extract internal tenant ID from request context
      // NotifyServiceGuard has already converted the external tenant ID (X-Tenant-ID header)
      // to the internal tenant object with UUID, stored in request.tenant
      const tenant = (req as any).tenant

      if (!tenant?.id) {
        this.logger.error(`Tenant not found. request.tenant: ${JSON.stringify(tenant)}`)
        throw new BadRequestException(
          'Tenant not found in request context. Ensure X-Tenant-ID header is provided and validated by NotifyServiceGuard.',
        )
      }

      this.logger.debug(`Fetching feature flags for tenant: ${tenant.name} (ID: ${tenant.id})`)
      const flags = await this.featureFlagService.getFlagsForTenant(tenant.id)
      this.logger.debug(`Flags for tenant ${tenant.id}: ${JSON.stringify(flags)}`)
      return flags
    } catch (error) {
      this.logger.error(
        `Error fetching feature flags for tenant: ${error instanceof Error ? error.message : String(error)}`,
      )
      // Safe default: return empty flags object
      return {}
    }
  }
}

/**
 * Client Feature Flags Controller (Frontend)
 * Routes for getting feature flags for the current user's tenant (frontend users)
 * Available to any authenticated frontend user
 *
 * This controller mirrors FeatureFlagClientController but for frontend users.
 * Frontend users authenticate via the standard Keycloak realm (FRONTEND_KEYCLOAK_ISSUER)
 * whereas service-to-service requests use the apigw realm (API_GATEWAY_KEYCLOAK_ISSUER).
 *
 * ARCHITECTURAL NOTE: This controller intentionally duplicates the GET method from FeatureFlagClientController
 * because the API Gateway requires separate routing:
 * - FeatureFlagClientController: /api/v1/feature-flags (service-to-service auth)
 * - FeatureFlagClientFrontendController: /api/v1/frontend/feature-flags (frontend auth)
 */
// Not part of the service API; kept out of the published spec.
@ApiExcludeController()
@Controller('frontend/feature-flags')
@UseGuards(NotifyFrontendRoleGuard)
export class FeatureFlagClientFrontendController {
  private readonly logger = new Logger(FeatureFlagClientFrontendController.name)

  constructor(private readonly featureFlagService: FeatureFlagService) {}

  /**
   * Get feature flags for the current user's tenant
   *
   * Tenant validation:
   * 1. User sends X-Tenant-ID header
   * 2. NotifyFrontendRoleGuard validates JWT and tenant access
   * 3. NotifyFrontendRoleGuard sets request.tenant with validated tenant info
   * 4. This endpoint uses request.tenant.id
   *
   * Returns feature flags for:
   * - Tenant-specific flags (where tenant_id matches user's selected tenant)
   * - Global flags (where tenant_id is NULL)
   *
   * Returns a map of feature codes to enabled status
   * Takes into account tenant-specific overrides and global flags
   *
   * Example response:
   * {
   *   "sms_notifications": true,
   *   "sse_notifications": true,
   *   "dashboard": false
   * }
   */
  @Version('1')
  @Get()
  async getForTenant(@Req() req: Request): Promise<Record<string, boolean>> {
    try {
      // Extract internal tenant ID from request context
      // NotifyFrontendRoleGuard has already validated the JWT and tenant access,
      // and set request.tenant with the validated tenant object
      const tenant = (req as any).tenant

      if (!tenant?.id) {
        this.logger.error(`Tenant not found. request.tenant: ${JSON.stringify(tenant)}`)
        throw new BadRequestException(
          'Tenant not found in request context. Ensure X-Tenant-ID header is provided and validated by NotifyFrontendRoleGuard.',
        )
      }

      this.logger.debug(`Fetching feature flags for tenant: ${tenant.name} (ID: ${tenant.id})`)
      const flags = await this.featureFlagService.getFlagsForTenant(tenant.id)
      this.logger.debug(`Flags for tenant ${tenant.id}: ${JSON.stringify(flags)}`)
      return flags
    } catch (error) {
      this.logger.error(
        `Error fetching feature flags for tenant: ${error instanceof Error ? error.message : String(error)}`,
      )
      // Safe default: return empty flags object
      return {}
    }
  }
}
