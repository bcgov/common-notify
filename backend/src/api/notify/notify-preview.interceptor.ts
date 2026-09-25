import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  ValidationPipe,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { from, Observable } from 'rxjs'
import { NotifyEmailChannel } from './schemas/notify-email-channel'
import { NotifySimpleRequest } from './schemas/notify-simple-request'
import { NotifyPreviewService } from './services/notify-preview.service'

export const NOTIFY_PREVIEW_BODY = 'notifyPreviewBody'

@Injectable()
export class NotifyPreviewInterceptor implements NestInterceptor {
  private readonly validationException = new ValidationPipe().createExceptionFactory()

  constructor(
    private readonly reflector: Reflector,
    private readonly previewService: NotifyPreviewService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.switchToHttp().getRequest().query.preview !== 'true') return next.handle()
    // Guards have already run. Do not enter next.handle(): that would execute @Queueable.
    return from(this.preview(context))
  }

  private async preview(context: ExecutionContext) {
    const http = context.switchToHttp()
    const request = http.getRequest()
    const bodyType = this.reflector.get<typeof NotifySimpleRequest | typeof NotifyEmailChannel>(
      NOTIFY_PREVIEW_BODY,
      context.getHandler(),
    )
    const body: object = request.body ?? {}
    if (typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException(['body must be an object'])
    }
    // Match the global ValidationPipe options and exception factory; the global filter
    // then produces the same fieldErrors/errors envelope as an ordinary send.
    const instance = plainToInstance<NotifySimpleRequest | NotifyEmailChannel, object>(
      bodyType,
      body,
    )
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: false,
    })
    if (errors.length) throw this.validationException(errors)
    const emailOnly = bodyType === NotifyEmailChannel
    const envelope = emailOnly
      ? { email: instance as NotifyEmailChannel }
      : (instance as NotifySimpleRequest)
    const original = emailOnly ? { email: body } : body
    const result = await this.previewService.render(request.tenant.id, envelope, original)
    http.getResponse().status(200)
    return result
  }
}
