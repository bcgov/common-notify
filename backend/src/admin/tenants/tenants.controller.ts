import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpException,
  UseGuards,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { TenantsService } from './tenants.service'
import { CreateTenantDto } from './dto/create-tenant.dto'
import { TenantDto } from './dto/tenant.dto'
import { JwtGuard } from '../../common/guards/jwt.guard'

@ApiTags('tenants')
@Controller({ path: 'admin/tenants', version: '1' })
@UseGuards(JwtGuard)
@ApiBearerAuth()
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  /**
   * Create a new tenant
   * This endpoint:
   * 1. Creates a consumer in Kong
   * 2. Generates an API key in Kong
   * 3. Stores tenant metadata in the database
   *
   * Requires a valid JWT Bearer token from Keycloak's APS realm.
   * The API key is returned ONCE and must be stored by the caller.
   */
  @Post()
  @ApiOperation({
    summary: 'Create a new tenant',
    description: 'Creates a new tenant. Requires JWT authentication.',
  })
  @ApiCreatedResponse({
    type: TenantDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT Bearer token',
  })
  async create(@Body() createTenantDto: CreateTenantDto) {
    try {
      return await this.tenantsService.create(createTenantDto)
    } catch (error) {
      throw new HttpException(error.message, 400)
    }
  }
  /**
   * List all tenants
   */
  @Get()
  @ApiOperation({
    summary: 'Get all tenants',
  })
  @ApiOkResponse({
    isArray: true,
    type: TenantDto,
  })
  async findAll() {
    return this.tenantsService.findAll()
  }

  /**
   * Get a specific tenant
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get a tenant by ID',
  })
  @ApiOkResponse({
    type: TenantDto,
  })
  async findOne(@Param('id') id: string) {
    const tenant = await this.tenantsService.findOne(id)
    if (!tenant) {
      throw new HttpException('Tenant not found', 404)
    }
    return tenant
  }

  /**
   * Delete a tenant
   */
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a tenant',
  })
  async delete(@Param('id') id: string) {
    try {
      await this.tenantsService.delete(id)
    } catch (error) {
      throw new HttpException(error.message, 400)
    }
  }
}
