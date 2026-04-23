import { Injectable, Logger } from '@nestjs/common'

@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name)

  notImplemented() {
    return {
      error: 'Not implemented',
      message: 'This endpoint is not yet implemented',
      timestamp: new Date().toISOString(),
    }
  }
}
