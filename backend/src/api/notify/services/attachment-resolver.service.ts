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
        const legacyAttachment = attachment as StoredNotifyAttachment & {
          filename?: string
          mimeType?: string
          storageKey?: string
          sizeBytes?: number
          contentSha256?: string
          storageProvider?: string
        }

        switch (legacyAttachment.storageProvider) {
          case 'local': {
            const content = await this.localAttachmentStorageService.readAttachment(
              legacyAttachment.storageKey!,
              legacyAttachment.contentSha256,
            )

            if (content.byteLength !== legacyAttachment.sizeBytes) {
              throw new InternalServerErrorException(
                `Stored attachment "${legacyAttachment.filename}" size verification failed`,
              )
            }

            return {
              filename: legacyAttachment.filename!,
              content,
              contentType: legacyAttachment.mimeType,
              sendingMethod: 'attach' as const,
            }
          }
          default:
            throw new InternalServerErrorException(
              `Unsupported attachment storage provider "${legacyAttachment.storageProvider ?? 'attachmentId'}"`,
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
