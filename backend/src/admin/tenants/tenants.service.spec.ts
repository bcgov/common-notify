import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { vi } from 'vitest'
import { TenantsService } from './tenants.service'
import { Tenant } from './entities/tenant.entity'

describe('TenantsService', () => {
  let service: TenantsService

  const mockTenant: Tenant = {
    id: 'uuid-1',
    externalId: 'ext-123',
    name: 'test-tenant',
    slug: 'test-tenant',
    status: 'active',
    createdAt: new Date(),
    createdBy: 'user@example.com',
    updatedAt: new Date(),
    updatedBy: 'user@example.com',
    isDeleted: false,
  }

  const mockRepository = {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        {
          provide: getRepositoryToken(Tenant),
          useValue: mockRepository,
        },
      ],
    }).compile()

    service = module.get<TenantsService>(TenantsService)
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('should create a new tenant with externalId', async () => {
      mockRepository.findOne.mockResolvedValue(null)
      mockRepository.create.mockReturnValue(mockTenant)
      mockRepository.save.mockResolvedValue(mockTenant)

      const result = await service.create({
        name: 'test-tenant',
        externalId: 'ext-123',
        slug: 'test-tenant',
        createdBy: 'user@example.com',
      })

      expect(result.tenant).toEqual(mockTenant)
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { name: 'test-tenant' },
      })
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-tenant',
          slug: 'test-tenant',
          externalId: 'ext-123',
        }),
      )
      expect(mockRepository.save).toHaveBeenCalled()
    })

    it('should auto-generate slug from name if not provided', async () => {
      const tenantWithAutoSlug = { ...mockTenant, slug: 'test-tenant' }
      mockRepository.findOne.mockResolvedValueOnce(null) // findByName
      mockRepository.findOne.mockResolvedValueOnce(null) // findBySlug
      mockRepository.create.mockReturnValue(tenantWithAutoSlug)
      mockRepository.save.mockResolvedValue(tenantWithAutoSlug)

      const result = await service.create({
        name: 'Test Tenant',
        externalId: 'ext-456',
      })

      expect(result.tenant.slug).toBe('test-tenant')
    })

    it('should throw BadRequestException if tenant already exists', async () => {
      mockRepository.findOne.mockResolvedValue(mockTenant)

      await expect(service.create({ name: 'test-tenant' })).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException if slug already exists', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null) // findByName returns null
      mockRepository.findOne.mockResolvedValueOnce(mockTenant) // findBySlug returns tenant

      await expect(service.create({ name: 'new-name', slug: 'test-tenant' })).rejects.toThrow(
        BadRequestException,
      )
    })

    it('should handle database errors during creation', async () => {
      mockRepository.findOne.mockResolvedValue(null)
      mockRepository.create.mockReturnValue(mockTenant)
      mockRepository.save.mockRejectedValue(new Error('Database error'))

      await expect(service.create({ name: 'test-tenant' })).rejects.toThrow(Error)
    })

    it('should create tenant with minimal required data', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null) // findByName
      mockRepository.findOne.mockResolvedValueOnce(null) // findBySlug
      mockRepository.create.mockReturnValue(mockTenant)
      mockRepository.save.mockResolvedValue(mockTenant)

      const result = await service.create({ name: 'minimal-tenant' })

      expect(result.tenant).toEqual(mockTenant)
    })
  })

  describe('findAll', () => {
    it('should return all tenants', async () => {
      const allTenants = [mockTenant, { ...mockTenant, id: 2, name: 'tenant-2' }]
      mockRepository.find.mockResolvedValue(allTenants)

      const result = await service.findAll()

      expect(result).toEqual(allTenants)
      expect(mockRepository.find).toHaveBeenCalled()
    })

    it('should return empty array if no tenants exist', async () => {
      mockRepository.find.mockResolvedValue([])

      const result = await service.findAll()

      expect(result).toEqual([])
    })
  })

  describe('findOne', () => {
    it('should find a tenant by ID', async () => {
      mockRepository.findOne.mockResolvedValue(mockTenant)

      const result = await service.findOne('uuid-1')

      expect(result).toEqual(mockTenant)
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 'uuid-1' } })
    })

    it('should return null if tenant not found', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      const result = await service.findOne('nonexistent-uuid')

      expect(result).toBeNull()
    })
  })

  describe('findByName', () => {
    it('should find a tenant by name', async () => {
      mockRepository.findOne.mockResolvedValue(mockTenant)

      const result = await service.findByName('test-tenant')

      expect(result).toEqual(mockTenant)
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { name: 'test-tenant' },
      })
    })

    it('should return null if tenant not found by name', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      const result = await service.findByName('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('findBySlug', () => {
    it('should find a tenant by slug', async () => {
      mockRepository.findOne.mockResolvedValue(mockTenant)

      const result = await service.findBySlug('test-tenant')

      expect(result).toEqual(mockTenant)
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'test-tenant' },
      })
    })

    it('should return null if tenant not found by slug', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      const result = await service.findBySlug('nonexistent-slug')

      expect(result).toBeNull()
    })
  })

  describe('findByExternalId', () => {
    it('should find a tenant by external ID', async () => {
      mockRepository.findOne.mockResolvedValue(mockTenant)

      const result = await service.findByExternalId('ext-123')

      expect(result).toEqual(mockTenant)
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { externalId: 'ext-123' },
      })
    })

    it('should return null if tenant not found by external ID', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      const result = await service.findByExternalId('nonexistent-ext')

      expect(result).toBeNull()
    })
  })

  describe('update', () => {
    it('should update a tenant', async () => {
      const updatedTenant = { ...mockTenant, name: 'updated-tenant' }
      mockRepository.findOne.mockResolvedValue(mockTenant)
      mockRepository.save.mockResolvedValue(updatedTenant)

      const result = await service.update('uuid-1', { name: 'updated-tenant' })

      expect(result).toEqual(updatedTenant)
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'updated-tenant',
        }),
      )
    })

    it('should throw NotFoundException if tenant does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      await expect(service.update('nonexistent-uuid', {})).rejects.toThrow(NotFoundException)
    })

    it('should update multiple fields', async () => {
      const updateData = {
        name: 'new-name',
        status: 'disabled' as const,
      }
      const updatedTenant = { ...mockTenant, ...updateData }
      mockRepository.findOne.mockResolvedValue(mockTenant)
      mockRepository.save.mockResolvedValue(updatedTenant)

      const result = await service.update('uuid-1', updateData)

      expect(result).toEqual(updatedTenant)
      expect(mockRepository.save).toHaveBeenCalledWith(expect.objectContaining(updateData))
    })
  })

  describe('delete', () => {
    it('should soft delete a tenant', async () => {
      mockRepository.findOne.mockResolvedValue(mockTenant)
      mockRepository.update.mockResolvedValue({ affected: 1 })

      await service.delete('uuid-1')

      expect(mockRepository.update).toHaveBeenCalledWith('uuid-1', { isDeleted: true })
    })

    it('should throw NotFoundException if tenant does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      await expect(service.delete('nonexistent-uuid')).rejects.toThrow(NotFoundException)
    })

    it('should handle database errors during deletion', async () => {
      mockRepository.findOne.mockResolvedValue(mockTenant)
      mockRepository.update.mockRejectedValue(new Error('Database error'))

      await expect(service.delete('uuid-1')).rejects.toThrow(Error)
    })
  })
})
