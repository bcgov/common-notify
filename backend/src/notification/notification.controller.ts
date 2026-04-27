import { Controller, Get, Param, Version, UseGuards, ParseUUIDPipe, Logger } from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { NotificationService } from './notification.service'
import { NotificationRequestDto } from './schemas'
import { AuthJwtGuard } from 'src/auth/guards/auth.jwt-guard'

@ApiTags('notifications')
@Controller('notifications')
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
    return this.notificationService.findAll('5ae63fe4-e928-4fd7-9f1d-a6b9ef98a5bf')
  }

  @Version('1')
  @Get(':id')
  @ApiOperation({ summary: 'Get a notification request by ID scoped to the authenticated tenant' })
  @ApiOkResponse({ type: NotificationRequestDto })
  @ApiNotFoundResponse({ description: 'Notification request not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.notificationService.findOne(id, '5ae63fe4-e928-4fd7-9f1d-a6b9ef98a5bf')
  }
}
