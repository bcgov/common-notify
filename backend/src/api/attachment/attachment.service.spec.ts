import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'
import { AttachmentService } from './attachment.service'
import { AttachmentRepository } from './attachment.repository'
import { ATTACHMENT_STORAGE } from './attachment.constants'
import { AttachmentStorage } from './attachment-storage.interface'
import { AttachmentEntity } from './entities/attachment.entity'

describe('AttachmentService', () => {
  let service: AttachmentService

  const mockAttachmentRepository = {
    create: vi.fn(),
    findByIdAndTenantId: vi.fn(),
    deleteByIdAndTenantId: vi.fn(),
  }

  const mockAttachmentStorage: AttachmentStorage = {
    upload: vi.fn(),
    head: vi.fn(),
    download: vi.fn(),
    delete: vi.fn(),
  }

  const createMockAttachment = (overrides: Partial<AttachmentEntity> = {}): AttachmentEntity => ({
    id: overrides.id ?? 'attachment-123',
    tenantId: overrides.tenantId ?? 'tenant-123',
    tenant: undefined as any,
    fileName: overrides.fileName ?? 'document.pdf',
    fileExtension: overrides.fileExtension ?? 'pdf',
    mimeType: overrides.mimeType ?? 'application/pdf',
    sizeBytes: overrides.sizeBytes ?? '11',
    storageKey: overrides.storageKey ?? 'attachment-123.pdf',
    contentSha256: overrides.contentSha256 ?? 'a'.repeat(64),
    uploadedBy: overrides.uploadedBy,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  })

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentService,
        { provide: AttachmentRepository, useValue: mockAttachmentRepository },
        { provide: ATTACHMENT_STORAGE, useValue: mockAttachmentStorage },
      ],
    }).compile()

    service = module.get<AttachmentService>(AttachmentService)
    vi.clearAllMocks()
  })

  it('uploads with a flat storage key and creates metadata after storage upload', async () => {
    vi.mocked(mockAttachmentStorage.upload).mockResolvedValue({
      storageKey: 'generated.pdf',
      sizeBytes: 11,
      contentSha256: 'b'.repeat(64),
    })
    vi.mocked(mockAttachmentRepository.create).mockImplementation(async (data) =>
      createMockAttachment(data),
    )

    const result = await service.uploadAttachment({
      tenantId: 'tenant-123',
      filename: 'Document.PDF',
      mimeType: 'application/pdf',
      content: Buffer.from('hello world'),
    })

    expect(mockAttachmentStorage.upload).toHaveBeenCalledTimes(1)
    const uploadInput = vi.mocked(mockAttachmentStorage.upload).mock.calls[0][0]
    expect(uploadInput.storageKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/,
    )
    expect(mockAttachmentRepository.create).toHaveBeenCalledTimes(1)
    expect(vi.mocked(mockAttachmentStorage.upload).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(mockAttachmentRepository.create).mock.invocationCallOrder[0],
    )
    expect(result.fileExtension).toBe('pdf')
  })

  it('triggers storage delete rollback when metadata creation fails', async () => {
    vi.mocked(mockAttachmentStorage.upload).mockResolvedValue({
      storageKey: 'generated.pdf',
      sizeBytes: 11,
      contentSha256: 'b'.repeat(64),
    })
    vi.mocked(mockAttachmentRepository.create).mockRejectedValue(new Error('db failed'))

    await expect(
      service.uploadAttachment({
        tenantId: 'tenant-123',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('hello world'),
      }),
    ).rejects.toThrow('Failed to create attachment metadata after upload')

    expect(mockAttachmentStorage.delete).toHaveBeenCalledTimes(1)
    expect(vi.mocked(mockAttachmentStorage.delete).mock.calls[0][0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/,
    )
  })

  it('rolls back prior uploads and metadata on partial multi-upload failure', async () => {
    const firstAttachment = createMockAttachment({
      id: 'attachment-1',
      tenantId: 'tenant-123',
      storageKey: 'attachment-1.pdf',
    })

    vi.mocked(mockAttachmentStorage.upload)
      .mockResolvedValueOnce({
        storageKey: 'attachment-1.pdf',
        sizeBytes: 11,
        contentSha256: 'c'.repeat(64),
      })
      .mockRejectedValueOnce(new Error('upload failed'))
    vi.mocked(mockAttachmentRepository.create).mockResolvedValueOnce(firstAttachment)

    await expect(
      service.uploadAttachments([
        {
          tenantId: 'tenant-123',
          filename: 'one.pdf',
          mimeType: 'application/pdf',
          content: Buffer.from('one'),
        },
        {
          tenantId: 'tenant-123',
          filename: 'two.pdf',
          mimeType: 'application/pdf',
          content: Buffer.from('two'),
        },
      ]),
    ).rejects.toThrow('upload failed')

    expect(mockAttachmentRepository.deleteByIdAndTenantId).toHaveBeenCalledWith(
      'attachment-1',
      'tenant-123',
    )
    expect(mockAttachmentStorage.delete).toHaveBeenCalledWith('attachment-1.pdf')
  })

  it('fetches attachment metadata using tenant-scoped repository lookup', async () => {
    const attachment = createMockAttachment()
    vi.mocked(mockAttachmentRepository.findByIdAndTenantId).mockResolvedValue(attachment)

    const result = await service.getAttachmentByIdAndTenantId('attachment-123', 'tenant-123')

    expect(result).toEqual(attachment)
    expect(mockAttachmentRepository.findByIdAndTenantId).toHaveBeenCalledWith(
      'attachment-123',
      'tenant-123',
    )
  })

  it('downloads attachment content using tenant-scoped metadata lookup', async () => {
    const attachment = createMockAttachment()
    vi.mocked(mockAttachmentRepository.findByIdAndTenantId).mockResolvedValue(attachment)
    vi.mocked(mockAttachmentStorage.download).mockResolvedValue(Buffer.from('hello world'))

    const result = await service.downloadAttachmentByIdAndTenantId('attachment-123', 'tenant-123')

    expect(mockAttachmentRepository.findByIdAndTenantId).toHaveBeenCalledWith(
      'attachment-123',
      'tenant-123',
    )
    expect(mockAttachmentStorage.download).toHaveBeenCalledWith('attachment-123.pdf')
    expect(result).toMatchObject({
      attachmentId: 'attachment-123',
      filename: 'document.pdf',
      fileExtension: 'pdf',
      storageKey: 'attachment-123.pdf',
    })
    expect(result.content).toEqual(Buffer.from('hello world'))
  })

  it('does not log raw file content during rollback warnings', async () => {
    const warnSpy = vi.spyOn((service as any).logger, 'warn')
    const firstAttachment = createMockAttachment({
      id: 'attachment-1',
      tenantId: 'tenant-123',
      storageKey: 'attachment-1.pdf',
    })

    vi.mocked(mockAttachmentStorage.upload)
      .mockResolvedValueOnce({
        storageKey: 'attachment-1.pdf',
        sizeBytes: 11,
        contentSha256: 'c'.repeat(64),
      })
      .mockRejectedValueOnce(new Error('upload failed'))
    vi.mocked(mockAttachmentRepository.create).mockResolvedValueOnce(firstAttachment)
    vi.mocked(mockAttachmentRepository.deleteByIdAndTenantId).mockRejectedValueOnce(
      new Error('delete failed'),
    )

    await expect(
      service.uploadAttachments([
        {
          tenantId: 'tenant-123',
          filename: 'one.pdf',
          mimeType: 'application/pdf',
          content: Buffer.from('super-secret-content'),
        },
        {
          tenantId: 'tenant-123',
          filename: 'two.pdf',
          mimeType: 'application/pdf',
          content: Buffer.from('second'),
        },
      ]),
    ).rejects.toThrow('upload failed')

    expect(warnSpy).toHaveBeenCalled()
    const loggedArgs = JSON.stringify(warnSpy.mock.calls)
    expect(loggedArgs).not.toContain('super-secret-content')
  })
})
