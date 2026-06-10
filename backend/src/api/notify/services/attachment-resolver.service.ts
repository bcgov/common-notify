import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { StoredNotifyAttachment } from '../schemas/stored-notify-attachment'
import { LocalAttachmentStorageService } from './local-attachment-storage.service'

export interface ResolvedEmailAttachment {
  filename: string
  content: Buffer
  contentType?: string
  sendingMethod: 'attach'
}

@Injectable()
export class AttachmentResolverService {
  private readonly logger = new Logger(AttachmentResolverService.name)

  constructor(private readonly localAttachmentStorageService: LocalAttachmentStorageService) {}

  async resolveEmailAttachments(
    attachments?: StoredNotifyAttachment[],
  ): Promise<ResolvedEmailAttachment[] | undefined> {
    if (!attachments?.length) {
      return undefined
    }

    const resolvedAttachments = await Promise.all(
      attachments.map(async (attachment) => {
        switch (attachment.storageProvider) {
          case 'local': {
            const content = await this.localAttachmentStorageService.readAttachment(
              attachment.storageKey,
              attachment.contentSha256,
            )

            if (content.byteLength !== attachment.sizeBytes) {
              throw new InternalServerErrorException(
                `Stored attachment "${attachment.filename}" size verification failed`,
              )
            }

            return {
              filename: attachment.filename,
              content,
              contentType: attachment.mimeType,
              sendingMethod: 'attach' as const,
            }
          }
          default:
            throw new InternalServerErrorException(
              `Unsupported attachment storage provider "${(attachment as any).storageProvider}"`,
            )
        }
      }),
    )

    this.logger.debug(
      `Resolved stored email attachments: ${JSON.stringify({
        storedAttachmentCount: attachments.length,
        resolvedAttachmentCount: resolvedAttachments.length,
      })}`,
    )

    return resolvedAttachments
  }
}
