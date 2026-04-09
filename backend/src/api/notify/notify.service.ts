import { Injectable } from '@nestjs/common'

@Injectable()
export class NotifyService {
  notImplemented() {
    return {
      error: 'Not implemented',
      message: 'This endpoint is not yet implemented',
      timestamp: new Date().toISOString(),
    }
  }
}
