import { Controller, Get, Version, UseGuards, Logger } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth } from '@nestjs/swagger'
import { NotificationService } from './notification.service'
import { NotificationRequestDto } from './schemas'
import { AuthJwtGuard } from 'src/auth/guards/auth.jwt-guard'

@ApiTags('notification_request')
@Controller('notification_request')
@UseGuards(AuthJwtGuard)
@ApiBearerAuth()
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name)

  constructor(private readonly notificationService: NotificationService) {}

  @Version('1')
  @Get()
  @ApiOperation({ summary: 'List all notification requests for the authenticated tenant' })
  @ApiOkResponse({ isArray: true, type: NotificationRequestDto })
  findAll() {
    return this.notificationService.findAll()
  }
}
