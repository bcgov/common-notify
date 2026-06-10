import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { InternalServerErrorException } from '@nestjs/common'
import { vi } from 'vitest'
import { AttachmentResolverService } from './attachment-resolver.service'
import { LocalAttachmentStorageService } from './local-attachment-storage.service'

describe('AttachmentResolverService', () => {
  let service: AttachmentResolverService
  let mockLocalAttachmentStorageService: {
    readAttachment: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    mockLocalAttachmentStorageService = {
      readAttachment: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentResolverService,
        {
          provide: LocalAttachmentStorageService,
          useValue: mockLocalAttachmentStorageService,
        },
      ],
    }).compile()

    service = module.get<AttachmentResolverService>(AttachmentResolverService)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should return undefined when there are no attachments', async () => {
    await expect(service.resolveEmailAttachments(undefined)).resolves.toBeUndefined()
  })

  it('should resolve stored local attachments into adapter-ready attachments', async () => {
    const content = Buffer.from('hello world')
    mockLocalAttachmentStorageService.readAttachment.mockResolvedValue(content)

    const result = await service.resolveEmailAttachments([
      {
        filename: 'hello.txt',
        mimeType: 'text/plain',
        storageKey: 'ab/abcdef.bin',
        sizeBytes: content.byteLength,
        contentSha256: 'hash',
        storageProvider: 'local',
      },
    ])

    expect(mockLocalAttachmentStorageService.readAttachment).toHaveBeenCalledWith(
      'ab/abcdef.bin',
      'hash',
    )
    expect(result).toEqual([
      {
        filename: 'hello.txt',
        content,
        contentType: 'text/plain',
        sendingMethod: 'attach',
      },
    ])
  })

  it('should throw when stored file size does not match metadata', async () => {
    mockLocalAttachmentStorageService.readAttachment.mockResolvedValue(Buffer.from('short'))

    await expect(
      service.resolveEmailAttachments([
        {
          filename: 'hello.txt',
          mimeType: 'text/plain',
          storageKey: 'ab/abcdef.bin',
          sizeBytes: 999,
          contentSha256: 'hash',
          storageProvider: 'local',
        },
      ]),
    ).rejects.toThrow(InternalServerErrorException)
  })
})
