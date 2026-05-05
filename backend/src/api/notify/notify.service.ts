import { Injectable, Logger } from '@nestjs/common'

@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name)

  constructor() {}

  notImplemented() {
    return {
      error: 'Not implemented',
      message: 'This endpoint is not yet implemented',
      timestamp: new Date().toISOString(),
    }
  }
}
