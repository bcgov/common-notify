import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { vi } from 'vitest'
import { TemplatesRepository } from './templates.repository'
import { Template } from './entities/template.entity'
import { TemplateVersion } from './entities/template-version.entity'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { TemplateEngine } from '../../enum/template-engine.enum'
import type { ParsedListQuery } from '../../common/query/list-query.types'

describe('TemplatesRepository', () => {
  let repository: TemplatesRepository

  const mockTemplate: Template = {
    id: 'template-123',
    tenantId: 'tenant-123',
    name: 'Welcome Email',
    description: 'Welcome template',
    channelCode: NotificationChannel.EMAIL,
    subject: 'Welcome to {{siteName}}!',
    body: 'Hello {{userName}}, welcome!',
    engineCode: TemplateEngine.HANDLEBARS,
    bodyType: 'markdown',
    version: 1,
    active: true,
    createdBy: 'user-123',
    createdAt: new Date(),
    updatedBy: 'user-123',
    updatedAt: new Date(),
  } as Template

  const mockTemplateVersion: TemplateVersion = {
    id: 'version-123',
    templateId: 'template-123',
    version: 1,
    subject: 'Welcome to {{siteName}}!',
    body: 'Hello {{userName}}, welcome!',
    bodyType: 'markdown',
    createdBy: 'user-123',
    createdAt: new Date(),
  } as TemplateVersion

  const mockTemplateRepository = {
    findOne: vi.fn(),
    findAndCount: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    createQueryBuilder: vi.fn(),
  }

  const mockVersionRepository = {
    findOne: vi.fn(),
    findAndCount: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesRepository,
        {
          provide: getRepositoryToken(Template),
          useValue: mockTemplateRepository,
        },
        {
          provide: getRepositoryToken(TemplateVersion),
          useValue: mockVersionRepository,
        },
      ],
    }).compile()

    repository = module.get<TemplatesRepository>(TemplatesRepository)

    vi.clearAllMocks()
  })

  describe('findById', () => {
    it('should find an active template by ID and tenant ID', async () => {
      mockTemplateRepository.findOne.mockResolvedValue(mockTemplate)

      const result = await repository.findById('tenant-123', 'template-123')

      expect(result).toEqual(mockTemplate)
      expect(mockTemplateRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'template-123', tenantId: 'tenant-123', active: true },
        relations: ['channel', 'engine'],
      })
    })

    it('should return null when template not found', async () => {
      mockTemplateRepository.findOne.mockResolvedValue(null)

      const result = await repository.findById('tenant-123', 'non-existent')

      expect(result).toBeNull()
    })
  })

  describe('findWithQuery', () => {
    it('should find all active templates with basic pagination', async () => {
      const templates = [mockTemplate]
      const mockQueryBuilder = {
        createQueryBuilder: vi.fn().mockReturnThis(),
        leftJoinAndSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        getManyAndCount: vi.fn().mockResolvedValue([templates, 1]),
      }

      mockTemplateRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any)

      const parsedQuery: ParsedListQuery = {
        page: 1,
        limit: 10,
        filters: [],
        sorts: [{ field: 'updatedAt', direction: 'DESC' }],
      }

      const [results, total] = await repository.findWithQuery('tenant-123', parsedQuery)

      expect(results).toEqual(templates)
      expect(total).toBe(1)
      expect(mockTemplateRepository.createQueryBuilder).toHaveBeenCalledWith('template')
    })

    it('should apply filters to the query builder', async () => {
      const templates = [mockTemplate]
      const mockQueryBuilder = {
        createQueryBuilder: vi.fn().mockReturnThis(),
        leftJoinAndSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        getManyAndCount: vi.fn().mockResolvedValue([templates, 1]),
      }

      mockTemplateRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any)

      const parsedQuery: ParsedListQuery = {
        page: 1,
        limit: 10,
        filters: [{ field: 'channelCode', operator: 'eq', value: 'EMAIL' }],
        sorts: [{ field: 'updatedAt', direction: 'DESC' }],
      }

      const [results, total] = await repository.findWithQuery('tenant-123', parsedQuery)

      expect(results).toEqual(templates)
      expect(total).toBe(1)
      // Verify where/andWhere was called for tenantId and active filters
      expect(mockQueryBuilder.where).toHaveBeenCalled()
    })

    it('should apply sorts to the query builder', async () => {
      const templates = [mockTemplate]
      const mockQueryBuilder = {
        createQueryBuilder: vi.fn().mockReturnThis(),
        leftJoinAndSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        getManyAndCount: vi.fn().mockResolvedValue([templates, 1]),
      }

      mockTemplateRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any)

      const parsedQuery: ParsedListQuery = {
        page: 1,
        limit: 10,
        filters: [],
        sorts: [
          { field: 'updatedAt', direction: 'DESC' },
          { field: 'name', direction: 'ASC' },
        ],
      }

      const [results] = await repository.findWithQuery('tenant-123', parsedQuery)

      expect(results).toEqual(templates)
      expect(mockQueryBuilder.addOrderBy).toHaveBeenCalled()
    })

    it('should return empty array when no templates match filters', async () => {
      const mockQueryBuilder = {
        createQueryBuilder: vi.fn().mockReturnThis(),
        leftJoinAndSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
      }

      mockTemplateRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any)

      const parsedQuery: ParsedListQuery = {
        page: 1,
        limit: 10,
        filters: [{ field: 'channelCode', operator: 'eq', value: 'SMS' }],
        sorts: [{ field: 'updatedAt', direction: 'DESC' }],
      }

      const [results, total] = await repository.findWithQuery('tenant-123', parsedQuery)

      expect(results).toEqual([])
      expect(total).toBe(0)
    })
  })

  describe('findByTenantId', () => {
    it('should find all active templates for a tenant with default pagination', async () => {
      const templates = [mockTemplate]
      const mockQueryBuilder = {
        leftJoinAndSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        getManyAndCount: vi.fn().mockResolvedValue([templates, 1]),
      }

      mockTemplateRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any)

      const [results, total] = await repository.findByTenantId('tenant-123')

      expect(results).toEqual(templates)
      expect(total).toBe(1)
      expect(mockTemplateRepository.createQueryBuilder).toHaveBeenCalledWith('template')
    })

    it('should find templates with custom limit and offset', async () => {
      const templates = [mockTemplate]
      const mockQueryBuilder = {
        leftJoinAndSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        getManyAndCount: vi.fn().mockResolvedValue([templates, 100]),
      }

      mockTemplateRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any)

      const [results, total] = await repository.findByTenantId('tenant-123', 10, 20)

      expect(results).toEqual(templates)
      expect(total).toBe(100)
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10)
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20)
    })

    it('should return empty array when no templates found', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
      }

      mockTemplateRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any)

      const [results, total] = await repository.findByTenantId('tenant-123')

      expect(results).toEqual([])
      expect(total).toBe(0)
    })
  })

  describe('findByName', () => {
    it('should find a template by name and tenant ID', async () => {
      mockTemplateRepository.findOne.mockResolvedValue(mockTemplate)

      const result = await repository.findByName('tenant-123', 'Welcome Email')

      expect(result).toEqual(mockTemplate)
      expect(mockTemplateRepository.findOne).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123', name: 'Welcome Email' },
        relations: ['channel', 'engine'],
      })
    })

    it('should return null when template with name not found', async () => {
      mockTemplateRepository.findOne.mockResolvedValue(null)

      const result = await repository.findByName('tenant-123', 'Non-Existent')

      expect(result).toBeNull()
    })
  })

  describe('create', () => {
    it('should create a new template', async () => {
      const createData: Partial<Template> = {
        tenantId: 'tenant-123',
        name: 'New Template',
        body: 'Content',
      }

      mockTemplateRepository.create.mockReturnValue(mockTemplate)
      mockTemplateRepository.save.mockResolvedValue(mockTemplate)

      const result = await repository.create(createData)

      expect(result).toEqual(mockTemplate)
      expect(mockTemplateRepository.create).toHaveBeenCalledWith(createData)
      expect(mockTemplateRepository.save).toHaveBeenCalledWith(mockTemplate)
    })

    it('should handle create with all fields', async () => {
      const createData: Partial<Template> = {
        tenantId: 'tenant-123',
        name: 'Complete Template',
        description: 'A complete template',
        channelCode: NotificationChannel.EMAIL,
        subject: 'Subject',
        body: 'Body',
        engineCode: TemplateEngine.MUSTACHE,
        bodyType: 'markdown',
        createdBy: 'user-456',
      }

      mockTemplateRepository.create.mockReturnValue(mockTemplate)
      mockTemplateRepository.save.mockResolvedValue(mockTemplate)

      const result = await repository.create(createData)

      expect(mockTemplateRepository.create).toHaveBeenCalledWith(createData)
      expect(result).toEqual(mockTemplate)
    })
  })

  describe('update', () => {
    it('should update an existing template', async () => {
      const updatedTemplate = { ...mockTemplate, name: 'Updated Name' }
      mockTemplateRepository.update.mockResolvedValue({ affected: 1 })
      mockTemplateRepository.findOne.mockResolvedValue(updatedTemplate)

      const result = await repository.update(updatedTemplate)

      expect(result).toEqual(updatedTemplate)
      expect(mockTemplateRepository.update).toHaveBeenCalledWith(
        { id: 'template-123', tenantId: 'tenant-123', active: true },
        expect.objectContaining({ name: 'Updated Name' }),
      )
    })

    it('should persist scalar foreign keys without stale eager relations', async () => {
      const updatedTemplate = {
        ...mockTemplate,
        engineCode: TemplateEngine.MUSTACHE,
        engine: { engineCode: TemplateEngine.HANDLEBARS },
      } as Template
      const reloadedTemplate = {
        ...updatedTemplate,
        engine: { engineCode: TemplateEngine.MUSTACHE },
      } as Template
      mockTemplateRepository.update.mockResolvedValue({ affected: 1 })
      mockTemplateRepository.findOne.mockResolvedValue(reloadedTemplate)

      const result = await repository.update(updatedTemplate)

      expect(mockTemplateRepository.update).toHaveBeenCalledWith(
        { id: 'template-123', tenantId: 'tenant-123', active: true },
        {
          name: updatedTemplate.name,
          description: updatedTemplate.description,
          channelCode: updatedTemplate.channelCode,
          subject: updatedTemplate.subject,
          body: updatedTemplate.body,
          engineCode: TemplateEngine.MUSTACHE,
          bodyType: updatedTemplate.bodyType,
          updatedBy: updatedTemplate.updatedBy,
        },
      )
      expect(result.engineCode).toBe(TemplateEngine.MUSTACHE)
      expect(result.engine.engineCode).toBe(TemplateEngine.MUSTACHE)
    })

    it('should fail when the tenant-owned active template was not updated', async () => {
      mockTemplateRepository.update.mockResolvedValue({ affected: 0 })

      await expect(repository.update(mockTemplate)).rejects.toThrow(
        'Template template-123 could not be updated',
      )
      expect(mockTemplateRepository.findOne).not.toHaveBeenCalled()
    })
  })

  describe('softDelete', () => {
    it('should mark a template as inactive and record the deletion time', async () => {
      mockTemplateRepository.update.mockResolvedValue({ affected: 1 })

      await repository.softDelete('template-123')

      expect(mockTemplateRepository.update).toHaveBeenCalledWith('template-123', {
        active: false,
        deletedAt: expect.any(Date),
      })
    })

    it('should handle delete of non-existent template', async () => {
      mockTemplateRepository.update.mockResolvedValue({ affected: 0 })

      await repository.softDelete('non-existent')

      expect(mockTemplateRepository.update).toHaveBeenCalledWith('non-existent', {
        active: false,
        deletedAt: expect.any(Date),
      })
    })
  })

  describe('findVersions', () => {
    it('should find all versions of a template with default pagination', async () => {
      const versions = [mockTemplateVersion]
      mockVersionRepository.findAndCount.mockResolvedValue([versions, 5])

      const [results, total] = await repository.findVersions('template-123')

      expect(results).toEqual(versions)
      expect(total).toBe(5)
      expect(mockVersionRepository.findAndCount).toHaveBeenCalledWith({
        where: { templateId: 'template-123' },
        relations: ['channel', 'engine'],
        take: 20,
        skip: 0,
        order: { version: 'DESC' },
      })
    })

    it('should find versions with custom limit and offset', async () => {
      const versions = [mockTemplateVersion]
      mockVersionRepository.findAndCount.mockResolvedValue([versions, 10])

      const [results, total] = await repository.findVersions('template-123', 5, 10)

      expect(results).toEqual(versions)
      expect(total).toBe(10)
      expect(mockVersionRepository.findAndCount).toHaveBeenCalledWith({
        where: { templateId: 'template-123' },
        relations: ['channel', 'engine'],
        take: 5,
        skip: 10,
        order: { version: 'DESC' },
      })
    })

    it('should return empty array when no versions found', async () => {
      mockVersionRepository.findAndCount.mockResolvedValue([[], 0])

      const [results, total] = await repository.findVersions('template-123')

      expect(results).toEqual([])
      expect(total).toBe(0)
    })
  })

  describe('getNextVersion', () => {
    it('should return next version number when versions exist', async () => {
      mockVersionRepository.findOne.mockResolvedValue({ version: 5 })

      const nextVersion = await repository.getNextVersion('template-123')

      expect(nextVersion).toBe(6)
      expect(mockVersionRepository.findOne).toHaveBeenCalledWith({
        where: { templateId: 'template-123' },
        order: { version: 'DESC' },
      })
    })

    it('should return 1 when no versions exist yet', async () => {
      mockVersionRepository.findOne.mockResolvedValue(null)

      const nextVersion = await repository.getNextVersion('template-123')

      expect(nextVersion).toBe(1)
    })

    it('should handle version 0', async () => {
      mockVersionRepository.findOne.mockResolvedValue({ version: 0 })

      const nextVersion = await repository.getNextVersion('template-123')

      expect(nextVersion).toBe(1)
    })
  })

  describe('createVersion', () => {
    it('should create a new template version record', async () => {
      const versionData: Partial<TemplateVersion> = {
        templateId: 'template-123',
        version: 2,
        subject: 'Subject',
        body: 'Body',
        bodyType: 'markdown',
      }

      mockVersionRepository.create.mockReturnValue(mockTemplateVersion)
      mockVersionRepository.save.mockResolvedValue(mockTemplateVersion)

      const result = await repository.createVersion(versionData)

      expect(result).toEqual(mockTemplateVersion)
      expect(mockVersionRepository.create).toHaveBeenCalledWith(versionData)
      expect(mockVersionRepository.save).toHaveBeenCalledWith(mockTemplateVersion)
    })
  })

  describe('findVersion', () => {
    it('should find a specific version by template ID and version number', async () => {
      mockVersionRepository.findOne.mockResolvedValue(mockTemplateVersion)

      const result = await repository.findVersion('template-123', 1)

      expect(result).toEqual(mockTemplateVersion)
      expect(mockVersionRepository.findOne).toHaveBeenCalledWith({
        where: { templateId: 'template-123', version: 1 },
        relations: ['channel', 'engine'],
      })
    })

    it('should return null when specific version not found', async () => {
      mockVersionRepository.findOne.mockResolvedValue(null)

      const result = await repository.findVersion('template-123', 99)

      expect(result).toBeNull()
    })

    it('should find higher version numbers', async () => {
      const v5 = { ...mockTemplateVersion, version: 5 }
      mockVersionRepository.findOne.mockResolvedValue(v5)

      const result = await repository.findVersion('template-123', 5)

      expect(result.version).toBe(5)
      expect(mockVersionRepository.findOne).toHaveBeenCalledWith({
        where: { templateId: 'template-123', version: 5 },
        relations: ['channel', 'engine'],
      })
    })
  })
})
