import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  PayloadTooLargeException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import * as path from 'path'
import { In, Repository } from 'typeorm'
import { NotifySimpleRequest } from '../schemas/notify-simple-request'
import { NotifyAttachment } from '../schemas/notify-attachment'
import { MimeTypeCode } from '../../notification/entities/mime-type-code.entity'
import { NotifyConfiguration } from '../../notification/entities/configuration.entity'

interface AttachmentConfig {
  maxAttachmentSizeMb: number
  maxRequestSizeMb: number
  maxAttachmentSizeBytes: number
  maxRequestSizeBytes: number
  maxFilenameLength: number
}

interface CollectedAttachment {
  attachment: NotifyAttachment
}

@Injectable()
export class AttachmentValidationService {
  private readonly logger = new Logger(AttachmentValidationService.name)

  constructor(
    @InjectRepository(MimeTypeCode)
    private readonly mimeTypeRepository: Repository<MimeTypeCode>,
    @InjectRepository(NotifyConfiguration)
    private readonly configurationRepository: Repository<NotifyConfiguration>,
  ) {}

  async validateAttachments(request: NotifySimpleRequest): Promise<void> {
    const attachments = this.collectAttachments(request)
    if (attachments.length === 0) {
      return
    }

    const [allowedMimeTypes, config] = await Promise.all([
      this.loadAllowedMimeTypes(),
      this.loadAttachmentConfig(),
    ])

    let totalDecodedBytes = 0

    for (const entry of attachments) {
      const { attachment } = entry

      this.validateMimeType(attachment.mimeType, allowedMimeTypes)
      this.validateFilename(attachment.filename, config.maxFilenameLength)

      const decoded = this.decodeBase64(entry, attachment.content)
      const decodedBytes = decoded.byteLength

      if (decodedBytes > config.maxAttachmentSizeBytes) {
        throw new PayloadTooLargeException(
          `Attachment '${attachment.filename}' exceeds the maximum allowed size of ${config.maxAttachmentSizeMb} MB.`,
        )
      }

      totalDecodedBytes += decodedBytes
      if (totalDecodedBytes > config.maxRequestSizeBytes) {
        throw new PayloadTooLargeException(
          `Combined attachment size exceeds the maximum allowed size of ${config.maxRequestSizeMb} MB.`,
        )
      }
    }
  }

  private collectAttachments(request: NotifySimpleRequest): CollectedAttachment[] {
    const collected: CollectedAttachment[] = []
    const channels: Array<{ attachments?: NotifyAttachment[] }> = [
      { attachments: request.email?.attachments },
      { attachments: request.sms?.attachments },
      { attachments: request.msgApp?.attachments },
    ]

    for (const { attachments } of channels) {
      attachments?.forEach((attachment) => {
        collected.push({ attachment })
      })
    }

    return collected
  }

  private async loadAllowedMimeTypes(): Promise<Set<string>> {
    const mimeTypes = await this.mimeTypeRepository.find({
      select: {
        code: true,
      },
    })

    return new Set(mimeTypes.map((mimeType) => mimeType.code))
  }

  private async loadAttachmentConfig(): Promise<AttachmentConfig> {
    const configKeys = [
      'attachment_max_size_mb',
      'attachment_max_request_size_mb',
      'attachment_max_filename_length',
    ]

    const configs = await this.configurationRepository.find({
      where: {
        key: In(configKeys),
      },
    })

    const configMap = new Map(configs.map((item) => [item.key, item.config]))

    const maxAttachmentSizeMb = this.readNumericConfig(configMap, 'attachment_max_size_mb')
    const maxRequestSizeMb = this.readNumericConfig(configMap, 'attachment_max_request_size_mb')
    const maxFilenameLength = this.readNumericConfig(configMap, 'attachment_max_filename_length')

    return {
      maxAttachmentSizeMb,
      maxRequestSizeMb,
      maxAttachmentSizeBytes: maxAttachmentSizeMb * 1024 * 1024,
      maxRequestSizeBytes: maxRequestSizeMb * 1024 * 1024,
      maxFilenameLength,
    }
  }

  private readNumericConfig(
    configMap: Map<string, NotifyConfiguration['config']>,
    key: string,
  ): number {
    const config = configMap.get(key)
    const value = config?.value

    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
      this.logger.error(`Attachment configuration is missing or invalid`, { key, value })
      throw new InternalServerErrorException(`Configuration "${key}" is missing or invalid`)
    }

    return value
  }

  private validateMimeType(mimeType: string, allowedMimeTypes: Set<string>): void {
    if (!allowedMimeTypes.has(mimeType)) {
      throw new BadRequestException(`Attachment MIME type '${mimeType}' is not allowed.`)
    }
  }

  private validateFilename(filename: string, maxFilenameLength: number): void {
    if (!filename.trim()) {
      throw new BadRequestException('Attachment filename is required and must be a string.')
    }

    if (filename.length > maxFilenameLength) {
      throw new BadRequestException(
        `Attachment filename exceeds the maximum allowed length of ${maxFilenameLength} characters.`,
      )
    }

    if (path.posix.isAbsolute(filename) || path.win32.isAbsolute(filename)) {
      throw new BadRequestException(
        `Attachment filename '${filename}' is invalid. Use a filename without directory paths.`,
      )
    }

    if (filename.includes('/') || filename.includes('\\')) {
      throw new BadRequestException(
        `Attachment filename '${filename}' is invalid. Use a filename without directory paths.`,
      )
    }

    if (filename.includes('..')) {
      throw new BadRequestException(
        `Attachment filename '${filename}' is invalid. Use a filename without directory paths.`,
      )
    }

    if (filename !== path.posix.basename(filename) || filename !== path.win32.basename(filename)) {
      throw new BadRequestException(
        `Attachment filename '${filename}' is invalid. Use a filename without directory paths.`,
      )
    }
  }

  private decodeBase64(entry: CollectedAttachment, data: string): Buffer {
    const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/

    if (data.length % 4 !== 0 || !base64Pattern.test(data)) {
      throw new BadRequestException(
        `Attachment '${entry.attachment.filename}' content is not valid base64.`,
      )
    }

    const decoded = Buffer.from(data, 'base64')
    if (decoded.toString('base64') !== data) {
      throw new BadRequestException(
        `Attachment '${entry.attachment.filename}' content is not valid base64.`,
      )
    }

    return decoded
  }
}
