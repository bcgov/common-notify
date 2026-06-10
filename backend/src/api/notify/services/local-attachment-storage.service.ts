import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import { StoredNotifyAttachment } from '../schemas/stored-notify-attachment'

interface StoreAttachmentInput {
  filename: string
  mimeType: string
  content: Buffer
}

@Injectable()
export class LocalAttachmentStorageService {
  private readonly logger = new Logger(LocalAttachmentStorageService.name)
  private readonly baseDirectory: string

  constructor(private readonly configService: ConfigService) {
    this.baseDirectory =
      this.configService.get<string>('attachments.storageDir') || '/tmp/common-notify/attachments'
  }

  async storeAttachment(input: StoreAttachmentInput): Promise<StoredNotifyAttachment> {
    const contentSha256 = crypto.createHash('sha256').update(input.content).digest('hex')
    const storageKey = path.posix.join(contentSha256.slice(0, 2), `${contentSha256}.bin`)
    const absoluteBaseDirectory = path.resolve(this.baseDirectory)
    const targetPath = path.resolve(absoluteBaseDirectory, storageKey)

    if (!targetPath.startsWith(`${absoluteBaseDirectory}${path.sep}`)) {
      throw new InternalServerErrorException('Generated attachment storage path is invalid')
    }

    try {
      await fs.mkdir(path.dirname(targetPath), { recursive: true })
      await fs.writeFile(targetPath, input.content)
    } catch (error) {
      this.logger.error('Failed to store attachment file', {
        filename: input.filename,
        mimeType: input.mimeType,
        storageKey,
        error: error instanceof Error ? error.message : String(error),
      })
      throw new InternalServerErrorException('Failed to store attachment file')
    }

    return {
      filename: input.filename,
      mimeType: input.mimeType,
      storageKey,
      sizeBytes: input.content.byteLength,
      contentSha256,
      storageProvider: 'local',
    }
  }

  getBaseDirectory(): string {
    return path.resolve(this.baseDirectory)
  }

  async readAttachment(storageKey: string, expectedSha256?: string): Promise<Buffer> {
    const absoluteBaseDirectory = path.resolve(this.baseDirectory)
    const targetPath = path.resolve(absoluteBaseDirectory, storageKey)

    if (!targetPath.startsWith(`${absoluteBaseDirectory}${path.sep}`)) {
      throw new InternalServerErrorException('Attachment storage path is invalid')
    }

    let content: Buffer
    try {
      content = await fs.readFile(targetPath)
    } catch (error) {
      this.logger.error('Failed to read attachment file', {
        storageKey,
        error: error instanceof Error ? error.message : String(error),
      })
      throw new InternalServerErrorException(`Failed to read stored attachment "${storageKey}"`)
    }

    if (expectedSha256) {
      const actualSha256 = crypto.createHash('sha256').update(content).digest('hex')
      if (actualSha256 !== expectedSha256) {
        this.logger.error('Stored attachment hash verification failed', {
          storageKey,
          expectedSha256,
          actualSha256,
        })
        throw new InternalServerErrorException(
          `Stored attachment "${storageKey}" failed integrity verification`,
        )
      }
    }

    return content
  }
}
