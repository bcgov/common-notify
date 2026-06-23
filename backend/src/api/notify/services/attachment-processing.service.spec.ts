import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { InternalServerErrorException } from '@nestjs/common'
import { vi } from 'vitest'
import { AttachmentProcessingService } from './attachment-processing.service'
import { AttachmentService } from '../../attachment/attachment.service'
import { NotifySimpleRequest } from '../schemas/notify-simple-request'

describe('AttachmentProcessingService', () => {
  let service: AttachmentProcessingService

  const mockAttachmentService = {
    uploadAttachments: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentProcessingService,
        {
          provide: AttachmentService,
          useValue: mockAttachmentService,
        },
      ],
    }).compile()

    service = module.get<AttachmentProcessingService>(AttachmentProcessingService)
    vi.clearAllMocks()
  })

  it('should return the request unchanged when there are no attachments', async () => {
    const request = { email: { recipients: { to: ['test@example.com'] } } } as NotifySimpleRequest

    const result = await service.processAttachments(request, 'tenant-123')

    expect(result).toEqual(request)
    expect(mockAttachmentService.uploadAttachments).not.toHaveBeenCalled()
  })

  it('should return attachmentId only for email attachments', async () => {
    mockAttachmentService.uploadAttachments.mockResolvedValue([
      { id: 'attachment-1' },
      { id: 'attachment-2' },
    ])

    const request = {
      email: {
        recipients: { to: ['test@example.com'] },
        attachments: [
          {
            filename: 'hello.txt',
            mimeType: 'text/plain',
            content: Buffer.from('hello').toString('base64'),
          },
          {
            filename: 'report.pdf',
            mimeType: 'application/pdf',
            content: Buffer.from('report').toString('base64'),
          },
        ],
      },
    } as NotifySimpleRequest

    const result = await service.processAttachments(request, 'tenant-123', 'user-123')

    expect(result.email?.attachments).toEqual([
      { attachmentId: 'attachment-1' },
      { attachmentId: 'attachment-2' },
    ])
  })

  it('should call AttachmentService with tenantId and decoded Buffers', async () => {
    mockAttachmentService.uploadAttachments.mockResolvedValue([{ id: 'attachment-1' }])
    const content = Buffer.from('hello world')

    const request = {
      sms: {
        recipients: { to: ['+15555550123'] },
        attachments: [
          {
            filename: 'sms.txt',
            mimeType: 'text/plain',
            content: content.toString('base64'),
          },
        ],
      },
    } as NotifySimpleRequest

    await service.processAttachments(request, 'tenant-123', 'user-123')

    expect(mockAttachmentService.uploadAttachments).toHaveBeenCalledWith([
      {
        tenantId: 'tenant-123',
        uploadedBy: 'user-123',
        filename: 'sms.txt',
        mimeType: 'text/plain',
        content,
      },
    ])
  })

  it('should preserve attachment order across multiple uploads', async () => {
    mockAttachmentService.uploadAttachments.mockResolvedValue([
      { id: 'attachment-a' },
      { id: 'attachment-b' },
    ])

    const request = {
      msgApp: {
        recipients: { to: ['user-123'] },
        content: { body: 'hello' },
        attachments: [
          {
            filename: 'first.txt',
            mimeType: 'text/plain',
            content: Buffer.from('first').toString('base64'),
          },
          {
            filename: 'second.txt',
            mimeType: 'text/plain',
            content: Buffer.from('second').toString('base64'),
          },
        ],
      },
    } as NotifySimpleRequest

    const result = await service.processAttachments(request, 'tenant-123')

    expect(result.msgApp?.attachments).toEqual([
      { attachmentId: 'attachment-a' },
      { attachmentId: 'attachment-b' },
    ])
  })

  it('should throw when attachment upload fails', async () => {
    mockAttachmentService.uploadAttachments.mockRejectedValue(
      new InternalServerErrorException('upload failed'),
    )

    const request = {
      email: {
        recipients: { to: ['test@example.com'] },
        attachments: [
          {
            filename: 'hello.txt',
            mimeType: 'text/plain',
            content: Buffer.from('hello').toString('base64'),
          },
        ],
      },
    } as NotifySimpleRequest

    await expect(service.processAttachments(request, 'tenant-123')).rejects.toThrow(
      InternalServerErrorException,
    )
  })
})
