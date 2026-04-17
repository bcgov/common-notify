import { Controller, Get, Param, Version, UseGuards, ParseUUIDPipe } from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { TenantGuard } from '../common/guards/tenant.guard'
import { GetTenant } from '../common/decorators/get-tenant.decorator'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { NotificationService } from './notification.service'
import { NotificationRequestDto } from './schemas'

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(TenantGuard)
@ApiBearerAuth()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Version('1')
  @Get()
  @ApiOperation({ summary: 'List all notification requests for the authenticated tenant' })
  @ApiOkResponse({ isArray: true, type: NotificationRequestDto })
  findAll(@GetTenant() tenant: Tenant) {
    return this.notificationService.findAll(tenant.id)
  }

  @Version('1')
  @Get(':id')
  @ApiOperation({ summary: 'Get a notification request by ID scoped to the authenticated tenant' })
  @ApiOkResponse({ type: NotificationRequestDto })
  @ApiNotFoundResponse({ description: 'Notification request not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @GetTenant() tenant: Tenant) {
    return this.notificationService.findOne(id, tenant.id)
  }
}
