import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { randomUUID } from 'crypto'
import * as path from 'path'
import { AttachmentRepository } from './attachment.repository'
import { ATTACHMENT_STORAGE } from './attachment.constants'
import { AttachmentStorage } from './attachment-storage.interface'
import { AttachmentEntity } from './entities/attachment.entity'

const MIME_TYPE_EXTENSION_MAP: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
}

export interface UploadAttachmentInput {
  tenantId: string
  filename: string
  mimeType: string
  content: Buffer
  uploadedBy?: string
}

export interface DownloadedAttachment {
  attachmentId: string
  filename: string
  fileExtension: string
  mimeType: string
  sizeBytes: number
  storageKey: string
  contentSha256: string
  content: Buffer
}

@Injectable()
export class AttachmentService {
  private readonly logger = new Logger(AttachmentService.name)

  constructor(
    private readonly attachmentRepository: AttachmentRepository,
    @Inject(ATTACHMENT_STORAGE) private readonly attachmentStorage: AttachmentStorage,
  ) {}

  async uploadAttachment(input: UploadAttachmentInput): Promise<AttachmentEntity> {
    const attachmentId = randomUUID()
    const fileExtension = this.deriveFileExtension(input.filename, input.mimeType)
    const storageKey = `${attachmentId}.${fileExtension}`

    let uploadResult: Awaited<ReturnType<AttachmentStorage['upload']>>
    try {
      uploadResult = await this.attachmentStorage.upload({
        storageKey,
        content: input.content,
        mimeType: input.mimeType,
      })
    } catch (error) {
      this.logger.error('Failed to upload attachment content', {
        tenantId: input.tenantId,
        filename: input.filename,
        mimeType: input.mimeType,
        storageKey,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }

    try {
      return await this.attachmentRepository.create({
        id: attachmentId,
        tenantId: input.tenantId,
        fileName: input.filename,
        fileExtension,
        mimeType: input.mimeType,
        sizeBytes: uploadResult.sizeBytes.toString(),
        storageKey: uploadResult.storageKey,
        contentSha256: uploadResult.contentSha256,
        uploadedBy: input.uploadedBy,
      })
    } catch {
      await this.rollbackUploadedObject(storageKey, input.tenantId, attachmentId)
      throw new InternalServerErrorException('Failed to create attachment metadata after upload')
    }
  }

  async uploadAttachments(inputs: UploadAttachmentInput[]): Promise<AttachmentEntity[]> {
    const createdAttachments: AttachmentEntity[] = []

    try {
      for (const input of inputs) {
        const attachment = await this.uploadAttachment(input)
        createdAttachments.push(attachment)
      }

      return createdAttachments
    } catch (error) {
      await this.rollbackCreatedAttachments(createdAttachments)
      throw error
    }
  }

  async getAttachmentByIdAndTenantId(
    attachmentId: string,
    tenantId: string,
  ): Promise<AttachmentEntity> {
    const attachment = await this.attachmentRepository.findByIdAndTenantId(attachmentId, tenantId)
    if (!attachment) {
      throw new NotFoundException(`Attachment '${attachmentId}' not found`)
    }

    return attachment
  }

  async downloadAttachmentByIdAndTenantId(
    attachmentId: string,
    tenantId: string,
  ): Promise<DownloadedAttachment> {
    const attachment = await this.getAttachmentByIdAndTenantId(attachmentId, tenantId)
    const content = await this.attachmentStorage.download(attachment.storageKey)

    return {
      attachmentId: attachment.id,
      filename: attachment.fileName,
      fileExtension: attachment.fileExtension,
      mimeType: attachment.mimeType,
      sizeBytes: Number(attachment.sizeBytes),
      storageKey: attachment.storageKey,
      contentSha256: attachment.contentSha256,
      content,
    }
  }

  private deriveFileExtension(filename: string, mimeType: string): string {
    const basename = path.posix.basename(filename).trim()
    const extensionFromFilename = path.posix.extname(basename).replace(/^\./, '').toLowerCase()

    if (extensionFromFilename) {
      if (!this.isSafeExtension(extensionFromFilename)) {
        throw new BadRequestException(`Attachment filename '${filename}' has an unsafe extension.`)
      }

      return extensionFromFilename
    }

    const extensionFromMimeType = MIME_TYPE_EXTENSION_MAP[mimeType]
    if (!extensionFromMimeType) {
      throw new BadRequestException(
        `Attachment filename '${filename}' must include a safe extension for MIME type '${mimeType}'.`,
      )
    }

    return extensionFromMimeType
  }

  private isSafeExtension(extension: string): boolean {
    return /^[a-z0-9]{1,50}$/.test(extension)
  }

  private async rollbackUploadedObject(
    storageKey: string,
    tenantId: string,
    attachmentId: string,
  ): Promise<void> {
    try {
      await this.attachmentStorage.delete(storageKey)
    } catch (error) {
      this.logger.warn('Failed to roll back uploaded attachment object', {
        tenantId,
        attachmentId,
        storageKey,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async rollbackCreatedAttachments(createdAttachments: AttachmentEntity[]): Promise<void> {
    for (const attachment of createdAttachments.reverse()) {
      try {
        await this.attachmentRepository.deleteByIdAndTenantId(attachment.id, attachment.tenantId)
      } catch (error) {
        this.logger.warn('Failed to roll back attachment metadata', {
          tenantId: attachment.tenantId,
          attachmentId: attachment.id,
          storageKey: attachment.storageKey,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      try {
        await this.attachmentStorage.delete(attachment.storageKey)
      } catch (error) {
        this.logger.warn('Failed to roll back attachment object', {
          tenantId: attachment.tenantId,
          attachmentId: attachment.id,
          storageKey: attachment.storageKey,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
}
