import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { NotifyAttachment } from '../schemas/notify-attachment'
import { NotifySimpleRequest } from '../schemas/notify-simple-request'
import {
  ProcessedNotifySimpleRequest,
  StoredNotifyAttachment,
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
        ? await this.processChannel(request.email, tenantId, uploadedBy)
        : undefined,
      sms: request.sms ? await this.processChannel(request.sms, tenantId, uploadedBy) : undefined,
      msgApp: request.msgApp
        ? await this.processChannel(request.msgApp, tenantId, uploadedBy)
        : undefined,
    }
  }

  private async processChannel<T extends { attachments?: NotifyAttachment[] }>(
    channel: T,
    tenantId: string,
    uploadedBy?: string,
  ): Promise<Omit<T, 'attachments'> & { attachments?: StoredNotifyAttachment[] }> {
    let attachments: StoredNotifyAttachment[] | undefined
    if (channel.attachments) {
      attachments = await this.storeDecodedAttachments(channel.attachments, tenantId, uploadedBy)
    } else if (channel.attachments !== undefined) {
      attachments = []
    }

    return { ...channel, attachments }
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
