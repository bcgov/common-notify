import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { NotifySimpleRequest } from '../schemas/notify-simple-request'
import {
  ProcessedNotifyEmailChannel,
  ProcessedNotifyMsgAppChannel,
  ProcessedNotifySimpleRequest,
  ProcessedNotifySmsChannel,
} from '../schemas/stored-notify-attachment'
import { LocalAttachmentStorageService } from './local-attachment-storage.service'

@Injectable()
export class AttachmentProcessingService {
  constructor(private readonly localAttachmentStorageService: LocalAttachmentStorageService) {}

  async processAttachments(request: NotifySimpleRequest): Promise<ProcessedNotifySimpleRequest> {
    return {
      ...request,
      email: request.email ? await this.processEmailChannel(request.email) : undefined,
      sms: request.sms ? await this.processSmsChannel(request.sms) : undefined,
      msgApp: request.msgApp ? await this.processMsgAppChannel(request.msgApp) : undefined,
    }
  }

  private async processEmailChannel(
    channel: NonNullable<NotifySimpleRequest['email']>,
  ): Promise<ProcessedNotifyEmailChannel> {
    return {
      ...channel,
      attachments: channel.attachments
        ? await Promise.all(
            channel.attachments.map((attachment) =>
              this.storeDecodedAttachment(
                attachment.filename,
                attachment.mimeType,
                attachment.data,
              ),
            ),
          )
        : channel.attachments === undefined
          ? undefined
          : [],
    }
  }

  private async processSmsChannel(
    channel: NonNullable<NotifySimpleRequest['sms']>,
  ): Promise<ProcessedNotifySmsChannel> {
    return {
      ...channel,
      attachments: channel.attachments
        ? await Promise.all(
            channel.attachments.map((attachment) =>
              this.storeDecodedAttachment(
                attachment.filename,
                attachment.mimeType,
                attachment.data,
              ),
            ),
          )
        : channel.attachments === undefined
          ? undefined
          : [],
    }
  }

  private async processMsgAppChannel(
    channel: NonNullable<NotifySimpleRequest['msgApp']>,
  ): Promise<ProcessedNotifyMsgAppChannel> {
    return {
      ...channel,
      attachments: channel.attachments
        ? await Promise.all(
            channel.attachments.map((attachment) =>
              this.storeDecodedAttachment(
                attachment.filename,
                attachment.mimeType,
                attachment.data,
              ),
            ),
          )
        : channel.attachments === undefined
          ? undefined
          : [],
    }
  }

  private async storeDecodedAttachment(filename: string, mimeType: string, base64Data: string) {
    let content: Buffer

    try {
      content = Buffer.from(base64Data, 'base64')
    } catch {
      throw new InternalServerErrorException('Failed to decode validated attachment data')
    }

    return this.localAttachmentStorageService.storeAttachment({
      filename,
      mimeType,
      content,
    })
  }
}
