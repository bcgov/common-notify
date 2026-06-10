import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { vi } from 'vitest'
import { Repository } from 'typeorm'
import { AttachmentValidationService } from './attachment-validation.service'
import { MimeTypeCode } from '../../notification/entities/mime-type-code.entity'
import { NotifyConfiguration } from '../../notification/entities/configuration.entity'
import { NotifySimpleRequest } from '../schemas/notify-simple-request'

const mockMimeTypeRepository = {
  find: vi.fn(),
}

const mockConfigurationRepository = {
  find: vi.fn(),
}

const defaultMimeTypes = [
  { code: 'text/plain' },
  { code: 'application/pdf' },
  { code: 'image/png' },
]

const defaultConfigurations = [
  { key: 'attachment_max_size_mb', config: { value: 5, type: 'number' } },
  { key: 'attachment_max_request_size_mb', config: { value: 25, type: 'number' } },
  { key: 'attachment_max_filename_length', config: { value: 255, type: 'number' } },
]

function makeRequest(overrides: Partial<NotifySimpleRequest> = {}): NotifySimpleRequest {
  return {
    ...overrides,
  } as NotifySimpleRequest
}

describe('AttachmentValidationService', () => {
  let service: AttachmentValidationService
  let mimeTypeRepository: Repository<MimeTypeCode>
  let configurationRepository: Repository<NotifyConfiguration>

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentValidationService,
        {
          provide: getRepositoryToken(MimeTypeCode),
          useValue: mockMimeTypeRepository,
        },
        {
          provide: getRepositoryToken(NotifyConfiguration),
          useValue: mockConfigurationRepository,
        },
      ],
    }).compile()

    service = module.get<AttachmentValidationService>(AttachmentValidationService)
    mimeTypeRepository = module.get<Repository<MimeTypeCode>>(getRepositoryToken(MimeTypeCode))
    configurationRepository = module.get<Repository<NotifyConfiguration>>(
      getRepositoryToken(NotifyConfiguration),
    )

    mockMimeTypeRepository.find.mockResolvedValue(defaultMimeTypes)
    mockConfigurationRepository.find.mockResolvedValue(defaultConfigurations)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should pass when no attachments are present', async () => {
    await expect(service.validateAttachments(makeRequest())).resolves.toBeUndefined()

    expect(mimeTypeRepository.find).not.toHaveBeenCalled()
    expect(configurationRepository.find).not.toHaveBeenCalled()
  })

  it('should pass for a valid email attachment', async () => {
    const request = makeRequest({
      email: {
        attachments: [
          {
            filename: 'hello.txt',
            mimeType: 'text/plain',
            content: Buffer.from('hello world').toString('base64'),
          },
        ],
      } as any,
    })

    await expect(service.validateAttachments(request)).resolves.toBeUndefined()
  })

  it('should pass for a valid sms attachment', async () => {
    const request = makeRequest({
      sms: {
        attachments: [
          {
            filename: 'note.txt',
            mimeType: 'text/plain',
            content: Buffer.from('sms attachment').toString('base64'),
          },
        ],
      } as any,
    })

    await expect(service.validateAttachments(request)).resolves.toBeUndefined()
  })

  it('should pass for a valid msgApp attachment', async () => {
    const request = makeRequest({
      msgApp: {
        attachments: [
          {
            filename: 'image.png',
            mimeType: 'image/png',
            content: Buffer.from('pngdata').toString('base64'),
          },
        ],
      } as any,
    })

    await expect(service.validateAttachments(request)).resolves.toBeUndefined()
  })

  it('should throw BadRequestException for invalid MIME type', async () => {
    const request = makeRequest({
      email: {
        attachments: [
          {
            filename: 'hello.txt',
            mimeType: 'application/x-msdownload',
            content: Buffer.from('hello world').toString('base64'),
          },
        ],
      } as any,
    })

    await expect(service.validateAttachments(request)).rejects.toThrow(BadRequestException)
  })

  it('should throw BadRequestException for invalid filename with path traversal', async () => {
    const request = makeRequest({
      email: {
        attachments: [
          {
            filename: '../secret.txt',
            mimeType: 'text/plain',
            content: Buffer.from('hello world').toString('base64'),
          },
        ],
      } as any,
    })

    await expect(service.validateAttachments(request)).rejects.toThrow(BadRequestException)
  })

  it('should throw BadRequestException for invalid filename with slash or backslash', async () => {
    const request = makeRequest({
      sms: {
        attachments: [
          {
            filename: 'folder\\hello.txt',
            mimeType: 'text/plain',
            content: Buffer.from('hello world').toString('base64'),
          },
        ],
      } as any,
    })

    await expect(service.validateAttachments(request)).rejects.toThrow(BadRequestException)
  })

  it('should throw BadRequestException for invalid base64', async () => {
    const request = makeRequest({
      msgApp: {
        attachments: [
          {
            filename: 'hello.txt',
            mimeType: 'text/plain',
            content: 'not-base64!!!',
          },
        ],
      } as any,
    })

    await expect(service.validateAttachments(request)).rejects.toThrow(BadRequestException)
  })

  it('should throw PayloadTooLargeException for an individual attachment over the configured limit', async () => {
    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1, 'a')
    const request = makeRequest({
      email: {
        attachments: [
          {
            filename: 'large.txt',
            mimeType: 'text/plain',
            content: oversizedBuffer.toString('base64'),
          },
        ],
      } as any,
    })

    await expect(service.validateAttachments(request)).rejects.toThrow(PayloadTooLargeException)
  })

  it('should throw PayloadTooLargeException when total attachments exceed the configured limit', async () => {
    const largeBuffer = Buffer.alloc(13 * 1024 * 1024, 'a')
    const request = makeRequest({
      email: {
        attachments: [
          {
            filename: 'large-one.txt',
            mimeType: 'text/plain',
            content: largeBuffer.toString('base64'),
          },
        ],
      } as any,
      sms: {
        attachments: [
          {
            filename: 'large-two.txt',
            mimeType: 'text/plain',
            content: largeBuffer.toString('base64'),
          },
        ],
      } as any,
    })

    await expect(service.validateAttachments(request)).rejects.toThrow(PayloadTooLargeException)
  })

  it('should throw BadRequestException when filename exceeds the configured limit', async () => {
    const request = makeRequest({
      email: {
        attachments: [
          {
            filename: `${'a'.repeat(256)}.txt`,
            mimeType: 'text/plain',
            content: Buffer.from('hello world').toString('base64'),
          },
        ],
      } as any,
    })

    await expect(service.validateAttachments(request)).rejects.toThrow(BadRequestException)
  })
})
