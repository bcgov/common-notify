import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { NotifySimpleRequest } from '../schemas/notify-simple-request'
import {
  ProcessedNotifyEmailChannel,
  ProcessedNotifyMsgAppChannel,
  ProcessedNotifySimpleRequest,
  ProcessedNotifySmsChannel,
} from '../schemas/stored-notify-attachment'
import { AttachmentService } from '../../attachment/attachment.service'

@Injectable()
export class AttachmentProcessingService {
  constructor(private readonly attachmentService: AttachmentService) {}

  async processAttachments(
    request: NotifySimpleRequest,
    tenantId: string,
    uploadedBy?: string,
  ): Promise<ProcessedNotifySimpleRequest> {
    return {
      ...request,
      email: request.email
        ? await this.processEmailChannel(request.email, tenantId, uploadedBy)
        : undefined,
      sms: request.sms
        ? await this.processSmsChannel(request.sms, tenantId, uploadedBy)
        : undefined,
      msgApp: request.msgApp
        ? await this.processMsgAppChannel(request.msgApp, tenantId, uploadedBy)
        : undefined,
    }
  }

  private async processEmailChannel(
    channel: NonNullable<NotifySimpleRequest['email']>,
    tenantId: string,
    uploadedBy?: string,
  ): Promise<ProcessedNotifyEmailChannel> {
    return {
      ...channel,
      attachments: channel.attachments
        ? await this.storeDecodedAttachments(channel.attachments, tenantId, uploadedBy)
        : channel.attachments === undefined
          ? undefined
          : [],
    }
  }

  private async processSmsChannel(
    channel: NonNullable<NotifySimpleRequest['sms']>,
    tenantId: string,
    uploadedBy?: string,
  ): Promise<ProcessedNotifySmsChannel> {
    return {
      ...channel,
      attachments: channel.attachments
        ? await this.storeDecodedAttachments(channel.attachments, tenantId, uploadedBy)
        : channel.attachments === undefined
          ? undefined
          : [],
    }
  }

  private async processMsgAppChannel(
    channel: NonNullable<NotifySimpleRequest['msgApp']>,
    tenantId: string,
    uploadedBy?: string,
  ): Promise<ProcessedNotifyMsgAppChannel> {
    return {
      ...channel,
      attachments: channel.attachments
        ? await this.storeDecodedAttachments(channel.attachments, tenantId, uploadedBy)
        : channel.attachments === undefined
          ? undefined
          : [],
    }
  }

  private async storeDecodedAttachments(
    attachments: Array<{ filename: string; mimeType: string; content: string }>,
    tenantId: string,
    uploadedBy?: string,
  ) {
    const decodedAttachments = attachments.map((attachment) => ({
      tenantId,
      uploadedBy,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      content: this.decodeAttachmentContent(attachment.content),
    }))

    const uploadedAttachments = await this.attachmentService.uploadAttachments(decodedAttachments)
    return uploadedAttachments.map((attachment) => ({
      attachmentId: attachment.id,
    }))
  }

  private decodeAttachmentContent(base64Data: string): Buffer {
    try {
      return Buffer.from(base64Data, 'base64')
    } catch {
      throw new InternalServerErrorException('Failed to decode validated attachment data')
    }
  }
}
