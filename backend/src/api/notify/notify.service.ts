import { Injectable, BadRequestException, Logger, Inject } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NotifySimpleRequest, NotifyEmailChannel } from './schemas'
import { EMAIL_ADAPTER, IEmailTransport, SendEmailResult } from 'src/adapters'

@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name)

  constructor(
    @Inject(EMAIL_ADAPTER) private readonly emailAdapter: IEmailTransport,
    private readonly configService: ConfigService,
  ) {}

  async simpleSend(request: NotifySimpleRequest): Promise<SendEmailResult> {
    if (!request.email && !request.sms && !request.msgApp) {
      throw new BadRequestException('At least one channel (email, sms, or msgApp) must be provided')
    }

    if (request.email) {
      return this.sendEmail(request.email)
    }

    throw new BadRequestException('SMS and msgApp channels are not yet implemented')
  }

  private sendEmail(email: NotifyEmailChannel): Promise<SendEmailResult> {
    const from = this.configService.get<string>('ches.from') ?? 'noreply@notify-test.gov.bc.ca'
    return this.emailAdapter.send({
      from,
      to: email.to.join(', '),
      subject: email.subject,
      body: email.body,
      ...(email.attachments && {
        attachments: email.attachments
          .filter((a) => a.filename && a.content)
          .map(({ content, filename }) => ({
            filename: filename!,
            content: content!,
            sendingMethod: 'attach' as const,
          })),
      }),
    })
  }

  notImplemented() {
    return {
      error: 'Not implemented',
      message: 'This endpoint is not yet implemented',
      timestamp: new Date().toISOString(),
    }
  }
}
