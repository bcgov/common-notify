import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { vi } from 'vitest'
import { AttachmentResolverService } from './attachment-resolver.service'
import { AttachmentService } from '../../attachment/attachment.service'

describe('AttachmentResolverService', () => {
  let service: AttachmentResolverService
  let mockAttachmentService: {
    downloadAttachmentByIdAndTenantId: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    mockAttachmentService = {
      downloadAttachmentByIdAndTenantId: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentResolverService,
        {
          provide: AttachmentService,
          useValue: mockAttachmentService,
        },
      ],
    }).compile()

    service = module.get<AttachmentResolverService>(AttachmentResolverService)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should return undefined when there are no attachments', async () => {
    await expect(service.resolveEmailAttachments('tenant-123', undefined)).resolves.toBeUndefined()
  })

  it('should resolve attachmentIds into adapter-ready attachments', async () => {
    const content = Buffer.from('hello world')
    mockAttachmentService.downloadAttachmentByIdAndTenantId.mockResolvedValue({
      attachmentId: 'attachment-123',
      filename: 'hello.txt',
      fileExtension: 'txt',
      mimeType: 'text/plain',
      sizeBytes: content.byteLength,
      content,
    } as any)

    const result = await service.resolveEmailAttachments('tenant-123', [
      { attachmentId: 'attachment-123' },
    ])

    expect(mockAttachmentService.downloadAttachmentByIdAndTenantId).toHaveBeenCalledWith(
      'attachment-123',
      'tenant-123',
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

  it('should surface attachment lookup failures', async () => {
    mockAttachmentService.downloadAttachmentByIdAndTenantId.mockRejectedValue(
      new NotFoundException("Attachment 'attachment-404' not found"),
    )

    await expect(
      service.resolveEmailAttachments('tenant-123', [{ attachmentId: 'attachment-404' }]),
    ).rejects.toThrow("Attachment 'attachment-404' not found")
  })
})
