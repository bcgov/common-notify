import { Injectable, PipeTransform, BadRequestException } from '@nestjs/common'
import { NotifySimpleRequest } from '../schemas/notify-simple-request'

@Injectable()
export class ValidateNotifyChannelPipe implements PipeTransform {
  transform(value: NotifySimpleRequest): NotifySimpleRequest {
    if (!value.email && !value.sms && !value.msgApp) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'At least one notification channel (email, sms, or msgApp) must be provided',
        error: 'Bad Request',
      })
    }
    return value
  }
}
