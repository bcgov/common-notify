import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import { Readable } from 'stream'
import {
  AttachmentStorage,
  HeadResult,
  UploadInput,
  UploadResult,
} from './attachment-storage.interface'
import { ATTACHMENT_S3_CLIENT } from './attachment.constants'

@Injectable()
export class S3AttachmentStorageService implements AttachmentStorage {
  private readonly logger = new Logger(S3AttachmentStorageService.name)
  private readonly bucket: string

  constructor(
    private readonly configService: ConfigService,
    @Inject(ATTACHMENT_S3_CLIENT) private readonly s3Client: S3Client,
  ) {
    this.bucket = this.configService.get<string>('s3.bucket') || ''
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const contentMd5 = crypto.createHash('md5').update(input.content).digest('base64')
    const contentSha256 = crypto.createHash('sha256').update(input.content).digest('hex')

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.storageKey,
          Body: input.content,
          ContentType: input.mimeType,
          ContentMD5: contentMd5,
        }),
      )
    } catch (error) {
      this.logger.error('Failed to upload attachment to object storage', {
        bucket: this.bucket,
        storageKey: input.storageKey,
        mimeType: input.mimeType,
        error: error instanceof Error ? error.message : String(error),
      })
      throw new ServiceUnavailableException('Failed to upload attachment to object storage')
    }

    const uploadedObject = await this.head(input.storageKey)
    if (!uploadedObject) {
      this.logger.error('Uploaded attachment could not be verified in object storage', {
        bucket: this.bucket,
        storageKey: input.storageKey,
      })
      throw new InternalServerErrorException(
        'Attachment upload could not be verified in object storage',
      )
    }

    if (
      typeof uploadedObject.contentLength === 'number' &&
      uploadedObject.contentLength !== input.content.byteLength
    ) {
      this.logger.error('Uploaded attachment size did not match object storage metadata', {
        bucket: this.bucket,
        storageKey: input.storageKey,
        expectedSizeBytes: input.content.byteLength,
        actualSizeBytes: uploadedObject.contentLength,
      })
      throw new InternalServerErrorException(
        'Attachment upload verification failed due to size mismatch',
      )
    }

    return {
      storageKey: input.storageKey,
      sizeBytes: input.content.byteLength,
      contentSha256,
    }
  }

  async head(storageKey: string): Promise<HeadResult | null> {
    try {
      const result = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        }),
      )

      return {
        contentLength: result.ContentLength,
        contentType: result.ContentType,
        eTag: result.ETag,
        lastModified: result.LastModified,
      }
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null
      }

      this.logger.error('Failed to read attachment metadata from object storage', {
        bucket: this.bucket,
        storageKey,
        error: error instanceof Error ? error.message : String(error),
      })
      throw new InternalServerErrorException(
        `Failed to read attachment metadata for "${storageKey}"`,
      )
    }
  }

  async download(storageKey: string): Promise<Buffer> {
    try {
      const result = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        }),
      )

      return await this.toBuffer(result.Body)
    } catch (error) {
      this.logger.error('Failed to download attachment from object storage', {
        bucket: this.bucket,
        storageKey,
        error: error instanceof Error ? error.message : String(error),
      })
      throw new InternalServerErrorException(`Failed to read stored attachment "${storageKey}"`)
    }
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        }),
      )
    } catch (error) {
      this.logger.error('Failed to delete attachment from object storage', {
        bucket: this.bucket,
        storageKey,
        error: error instanceof Error ? error.message : String(error),
      })
      throw new InternalServerErrorException(`Failed to delete stored attachment "${storageKey}"`)
    }
  }

  private isNotFoundError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false
    }

    const candidate = error as {
      name?: unknown
      Code?: unknown
      $metadata?: { httpStatusCode?: number }
    }

    return (
      candidate.name === 'NotFound' ||
      candidate.name === 'NoSuchKey' ||
      candidate.Code === 'NotFound' ||
      candidate.Code === 'NoSuchKey' ||
      candidate.$metadata?.httpStatusCode === 404
    )
  }

  private async toBuffer(body: unknown): Promise<Buffer> {
    if (!body) {
      throw new Error('Attachment body is empty')
    }

    if (Buffer.isBuffer(body)) {
      return body
    }

    if (body instanceof Uint8Array) {
      return Buffer.from(body)
    }

    if (typeof body === 'string') {
      return Buffer.from(body)
    }

    if (
      typeof body === 'object' &&
      'transformToByteArray' in body &&
      typeof (body as { transformToByteArray?: unknown }).transformToByteArray === 'function'
    ) {
      const bytes = await (
        body as { transformToByteArray: () => Promise<Uint8Array> }
      ).transformToByteArray()
      return Buffer.from(bytes)
    }

    if (body instanceof Readable) {
      const chunks: Buffer[] = []

      for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }

      return Buffer.concat(chunks)
    }

    throw new Error('Unsupported attachment body type returned from object storage')
  }
}
