import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { In } from 'typeorm'
import { vi } from 'vitest'
import { AttachmentRepository } from './attachment.repository'
import { AttachmentEntity } from './entities/attachment.entity'

describe('AttachmentRepository', () => {
  let repository: AttachmentRepository

  const mockAttachment: AttachmentEntity = {
    id: 'attachment-123',
    tenantId: 'tenant-123',
    tenant: undefined as any,
    fileName: 'document.pdf',
    fileExtension: 'pdf',
    mimeType: 'application/pdf',
    sizeBytes: '1024',
    storageKey: 'attachment-123.pdf',
    contentSha256: 'a'.repeat(64),
    uploadedBy: '00000000-0000-0000-0000-000000000001',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockRepo = {
    create: vi.fn(),
    save: vi.fn(),
    findOne: vi.fn(),
    find: vi.fn(),
    delete: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentRepository,
        {
          provide: getRepositoryToken(AttachmentEntity),
          useValue: mockRepo,
        },
      ],
    }).compile()

    repository = module.get<AttachmentRepository>(AttachmentRepository)
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('creates and saves an attachment scoped by tenant data', async () => {
      const data: Partial<AttachmentEntity> = {
        tenantId: 'tenant-123',
        fileName: 'document.pdf',
      }

      mockRepo.create.mockReturnValue(mockAttachment)
      mockRepo.save.mockResolvedValue(mockAttachment)

      const result = await repository.create(data)

      expect(result).toEqual(mockAttachment)
      expect(mockRepo.create).toHaveBeenCalledWith(data)
      expect(mockRepo.save).toHaveBeenCalledWith(mockAttachment)
    })
  })

  describe('findByIdAndTenantId', () => {
    it('finds a single attachment by id and tenant id', async () => {
      mockRepo.findOne.mockResolvedValue(mockAttachment)

      const result = await repository.findByIdAndTenantId('attachment-123', 'tenant-123')

      expect(result).toEqual(mockAttachment)
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'attachment-123', tenantId: 'tenant-123' },
      })
    })
  })

  describe('findManyByIdsAndTenantId', () => {
    it('finds many attachments by ids and tenant id', async () => {
      mockRepo.find.mockResolvedValue([mockAttachment])

      const result = await repository.findManyByIdsAndTenantId(
        ['attachment-123', 'attachment-456'],
        'tenant-123',
      )

      expect(result).toEqual([mockAttachment])
      expect(mockRepo.find).toHaveBeenCalledWith({
        where: {
          id: In(['attachment-123', 'attachment-456']),
          tenantId: 'tenant-123',
        },
      })
    })

    it('returns an empty array without querying when ids are empty', async () => {
      const result = await repository.findManyByIdsAndTenantId([], 'tenant-123')

      expect(result).toEqual([])
      expect(mockRepo.find).not.toHaveBeenCalled()
    })
  })

  describe('deleteByIdAndTenantId', () => {
    it('deletes by id and tenant id only', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 1 })

      await repository.deleteByIdAndTenantId('attachment-123', 'tenant-123')

      expect(mockRepo.delete).toHaveBeenCalledWith({
        id: 'attachment-123',
        tenantId: 'tenant-123',
      })
    })
  })
})
