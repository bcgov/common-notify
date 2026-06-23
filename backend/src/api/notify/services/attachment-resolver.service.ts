import { Injectable, Logger } from '@nestjs/common'
import { AttachmentService } from '../../attachment/attachment.service'
import { StoredNotifyAttachment } from '../schemas/stored-notify-attachment'

export interface ResolvedEmailAttachment {
  filename: string
  content: Buffer
  contentType?: string
  sendingMethod: 'attach'
}

@Injectable()
export class AttachmentResolverService {
  private readonly logger = new Logger(AttachmentResolverService.name)

  constructor(private readonly attachmentService: AttachmentService) {}

  async resolveEmailAttachments(
    tenantId: string,
    attachments?: StoredNotifyAttachment[],
  ): Promise<ResolvedEmailAttachment[] | undefined> {
    if (!attachments?.length) {
      return undefined
    }

    const resolvedAttachments = await Promise.all(
      attachments.map(async (attachment) => {
        try {
          const downloadedAttachment =
            await this.attachmentService.downloadAttachmentByIdAndTenantId(
              attachment.attachmentId,
              tenantId,
            )

          return {
            filename: downloadedAttachment.filename,
            content: downloadedAttachment.content,
            contentType: downloadedAttachment.mimeType,
            sendingMethod: 'attach' as const,
          }
        } catch (error) {
          this.logger.error('Failed to resolve attachment content for delivery', {
            tenantId,
            attachmentId: attachment.attachmentId,
            error: error instanceof Error ? error.message : String(error),
          })
          throw error
        }
      }),
    )

    this.logger.debug(
      `Resolved stored email attachments: ${JSON.stringify({
        tenantId,
        storedAttachmentCount: attachments.length,
        resolvedAttachmentCount: resolvedAttachments.length,
      })}`,
    )

    return resolvedAttachments
  }
}
