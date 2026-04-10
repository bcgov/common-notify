import { Injectable, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ChesApiClient } from '../../ches/ches-api.client'
import { ChesMessageObject } from '../../ches/schemas/ches-message-object'
import { ChesTransactionResponse } from '../../ches/schemas/ches-transaction-response'
import { NotifySimpleRequest, NotifyEmailChannel } from './schemas'

@Injectable()
export class NotifyService {
  constructor(
    private readonly chesApiClient: ChesApiClient,
    private readonly configService: ConfigService,
  ) {}

  async simpleSend(request: NotifySimpleRequest): Promise<ChesTransactionResponse> {
    if (!request.email && !request.sms && !request.msgApp) {
      throw new BadRequestException('At least one channel (email, sms, or msgApp) must be provided')
    }

    if (request.email) {
      return this.sendEmail(request.email)
    }

    throw new BadRequestException('SMS and msgApp channels are not yet implemented')
  }

  private sendEmail(email: NotifyEmailChannel): Promise<ChesTransactionResponse> {
    const from = this.configService.get<string>('ches.from') ?? 'noreply@localhost'
    const chesMessage: ChesMessageObject = {
      from,
      to: email.to,
      subject: email.subject,
      body: email.body,
      bodyType: email.bodyType ?? 'text',
      ...(email.cc && { cc: email.cc }),
      ...(email.bcc && { bcc: email.bcc }),
      ...(email.priority && { priority: email.priority }),
      ...(email.encoding && { encoding: email.encoding as 'base64' | 'binary' | 'hex' | 'utf-8' }),
      ...(email.delayedSend && { delayTS: new Date(email.delayedSend).getTime() }),
      ...(email.attachments && {
        attachments: email.attachments.map(({ content, contentType, filename }) => ({
          content,
          contentType,
          filename,
        })),
      }),
    }
    return this.chesApiClient.sendEmail(chesMessage)
  }

  notImplemented() {
    return {
      error: 'Not implemented',
      message: 'This endpoint is not yet implemented',
      timestamp: new Date().toISOString(),
    }
  }
}
