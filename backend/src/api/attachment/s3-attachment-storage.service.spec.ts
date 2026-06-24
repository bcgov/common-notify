import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { Readable } from 'stream'
import { vi } from 'vitest'
import { ATTACHMENT_S3_CLIENT } from './attachment.constants'
import { S3AttachmentStorageService } from './s3-attachment-storage.service'

describe('S3AttachmentStorageService', () => {
  let service: S3AttachmentStorageService

  const mockConfigService = {
    get: vi.fn(),
  }

  const mockS3Client = {
    send: vi.fn(),
  }

  beforeEach(async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      switch (key) {
        case 's3.bucket':
          return 'notify-local'
        default:
          return undefined
      }
    })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3AttachmentStorageService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: ATTACHMENT_S3_CLIENT, useValue: mockS3Client },
      ],
    }).compile()

    service = module.get<S3AttachmentStorageService>(S3AttachmentStorageService)
    vi.clearAllMocks()
    mockConfigService.get.mockImplementation((key: string) => {
      switch (key) {
        case 's3.bucket':
          return 'notify-local'
        default:
          return undefined
      }
    })
  })

  it('uploads with ContentMD5 and verifies with HeadObjectCommand', async () => {
    const content = Buffer.from('hello world')
    mockS3Client.send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ ContentLength: content.byteLength })

    const result = await service.upload({
      storageKey: 'attachment-123.pdf',
      content,
      mimeType: 'application/pdf',
    })

    expect(result).toEqual({
      storageKey: 'attachment-123.pdf',
      sizeBytes: content.byteLength,
      contentSha256: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    })
    expect(mockS3Client.send).toHaveBeenCalledTimes(2)
    expect(mockS3Client.send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand)
    expect(mockS3Client.send.mock.calls[0][0].input).toMatchObject({
      Bucket: 'notify-local',
      Key: 'attachment-123.pdf',
      ContentType: 'application/pdf',
      ContentMD5: 'XrY7u+Ae7tCTyyK7j1rNww==',
    })
    expect(mockS3Client.send.mock.calls[1][0]).toBeInstanceOf(HeadObjectCommand)
    expect(mockS3Client.send.mock.calls[1][0].input).toEqual({
      Bucket: 'notify-local',
      Key: 'attachment-123.pdf',
    })
  })

  it('fails upload verification when HeadObject reports a different size', async () => {
    const content = Buffer.from('hello world')
    mockS3Client.send.mockResolvedValueOnce({}).mockResolvedValueOnce({ ContentLength: 99 })

    await expect(
      service.upload({
        storageKey: 'attachment-123.pdf',
        content,
        mimeType: 'application/pdf',
      }),
    ).rejects.toThrow('Attachment upload verification failed due to size mismatch')
  })

  it('downloads and converts a stream body into a Buffer', async () => {
    mockS3Client.send.mockResolvedValue({
      Body: Readable.from([Buffer.from('hello '), Buffer.from('world')]),
    })

    const result = await service.download('attachment-123.pdf')

    expect(result).toEqual(Buffer.from('hello world'))
    expect(mockS3Client.send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand)
  })

  it('deletes using DeleteObjectCommand', async () => {
    mockS3Client.send.mockResolvedValue({})

    await service.delete('attachment-123.pdf')

    expect(mockS3Client.send).toHaveBeenCalledTimes(1)
    expect(mockS3Client.send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand)
    expect(mockS3Client.send.mock.calls[0][0].input).toEqual({
      Bucket: 'notify-local',
      Key: 'attachment-123.pdf',
    })
  })

  it('returns null on head when the object is missing', async () => {
    mockS3Client.send.mockRejectedValue({
      name: 'NotFound',
      $metadata: { httpStatusCode: 404 },
    })

    const result = await service.head('missing.pdf')

    expect(result).toBeNull()
  })

  it('throws a safe error when download fails', async () => {
    mockS3Client.send.mockRejectedValue(new Error('boom'))

    await expect(service.download('attachment-123.pdf')).rejects.toThrow(
      'Failed to read stored attachment "attachment-123.pdf"',
    )
  })
})
