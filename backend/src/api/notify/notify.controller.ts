import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Param,
  Query,
  Body,
  HttpCode,
  Version,
} from '@nestjs/common'
import { NotifyService } from './notify.service'

@Controller('notifysimple')
export class NotifySimpleController {
  constructor(private readonly notifyService: NotifyService) {}

  @Version('1')
  @Post()
  @HttpCode(501)
  simpleSend(@Body() body: any) {
    return this.notifyService.notImplemented()
  }
}

@Controller('notifyevent')
export class NotifyEventController {
  constructor(private readonly notifyService: NotifyService) {}

  @Version('1')
  @Post()
  @HttpCode(501)
  eventTypeSend(@Body() body: any) {
    return this.notifyService.notImplemented()
  }

  @Version('1')
  @Post('preview')
  @HttpCode(501)
  eventTypePreview(@Body() body: any) {
    return this.notifyService.notImplemented()
  }

  @Version('1')
  @Get('types')
  @HttpCode(501)
  listEventTypes(@Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.notifyService.notImplemented()
  }

  @Version('1')
  @Get('types/:eventTypeId')
  @HttpCode(501)
  getEventType(@Param('eventTypeId') eventTypeId: string) {
    return this.notifyService.notImplemented()
  }
}

@Controller('notify')
export class NotifyController {
  constructor(private readonly notifyService: NotifyService) {}

  @Version('1')
  @Get()
  @HttpCode(501)
  listNotifications(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.notifyService.notImplemented()
  }

  @Version('1')
  @Delete()
  @HttpCode(501)
  cancelNotification(@Query('notifyId') notifyId: string) {
    return this.notifyService.notImplemented()
  }

  @Version('1')
  @Get('status/:notifyId')
  @HttpCode(501)
  getNotificationStatus(@Param('notifyId') notifyId: string) {
    return this.notifyService.notImplemented()
  }

  @Version('1')
  @Post('registerCallback')
  @HttpCode(501)
  registerCallback(@Body() body: any) {
    return this.notifyService.notImplemented()
  }

  @Version('1')
  @Patch('registerCallback/:callbackId')
  @HttpCode(501)
  updateCallback(@Param('callbackId') callbackId: string, @Body() body: any) {
    return this.notifyService.notImplemented()
  }

  @Version('1')
  @Delete('registerCallback/:callbackId')
  @HttpCode(501)
  deleteCallback(@Param('callbackId') callbackId: string) {
    return this.notifyService.notImplemented()
  }
}

@Controller('templates')
export class TemplatesController {
  constructor(private readonly notifyService: NotifyService) {}

  @Version('1')
  @Get()
  @HttpCode(501)
  listTemplates(@Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.notifyService.notImplemented()
  }

  @Version('1')
  @Get(':templateId')
  @HttpCode(501)
  getTemplate(@Param('templateId') templateId: string) {
    return this.notifyService.notImplemented()
  }
}

@Controller('ches/api/v1/email')
export class ChesEmailController {
  constructor(private readonly notifyService: NotifyService) {}

  @Post()
  @HttpCode(501)
  chesEmail(@Body() body: any) {
    return this.notifyService.notImplemented()
  }
}
