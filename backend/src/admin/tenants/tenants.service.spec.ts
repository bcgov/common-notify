import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { TenantsService } from './tenants.service'
import { Tenant } from './entities/tenant.entity'

describe('TenantsService', () => {
  let service: TenantsService
  let repository: Repository<Tenant>

  const mockTenant: Tenant = {
    id: 1,
    name: 'test-tenant',
    description: 'Test tenant',
    organization: 'Test Org',
    contactEmail: 'contact@test.com',
    contactName: 'John Doe',
    kongUsername: 'test-tenant',
    kongConsumerId: 'kong-123',
    oauth2ClientId: 'client-123',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
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
    repository = module.get<Repository<Tenant>>(getRepositoryToken(Tenant))
    jest.clearAllMocks()
  })

  describe('create', () => {
    it('should create a new tenant with Kong username', async () => {
      mockRepository.findOne.mockResolvedValue(null)
      mockRepository.create.mockReturnValue(mockTenant)
      mockRepository.save.mockResolvedValue(mockTenant)

      const result = await service.create(
        {
          name: 'test-tenant',
          description: 'Test tenant',
          organization: 'Test Org',
          contactEmail: 'contact@test.com',
          contactName: 'John Doe',
        },
        { kongUsername: 'test-tenant' },
      )

      expect(result.tenant).toEqual(mockTenant)
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { name: 'test-tenant' },
      })
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-tenant',
          kongUsername: 'test-tenant',
        }),
      )
      expect(mockRepository.save).toHaveBeenCalled()
    })

    it('should create a new tenant with OAuth2 client ID', async () => {
      const oauth2Tenant = { ...mockTenant, oauth2ClientId: 'oauth2-456' }
      mockRepository.findOne.mockResolvedValue(null)
      mockRepository.create.mockReturnValue(oauth2Tenant)
      mockRepository.save.mockResolvedValue(oauth2Tenant)

      const result = await service.create(
        { name: 'oauth2-tenant' },
        { oauth2ClientId: 'oauth2-456' },
      )

      expect(result.tenant).toEqual(oauth2Tenant)
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          oauth2ClientId: 'oauth2-456',
        }),
      )
    })

    it('should throw BadRequestException if tenant already exists', async () => {
      mockRepository.findOne.mockResolvedValue(mockTenant)

      await expect(
        service.create({ name: 'test-tenant' }),
      ).rejects.toThrow(BadRequestException)
    })

    it('should handle database errors during creation', async () => {
      mockRepository.findOne.mockResolvedValue(null)
      mockRepository.create.mockReturnValue(mockTenant)
      mockRepository.save.mockRejectedValue(new Error('Database error'))

      await expect(service.create({ name: 'test-tenant' })).rejects.toThrow(Error)
    })

    it('should create tenant with minimal required data', async () => {
      mockRepository.findOne.mockResolvedValue(null)
      mockRepository.create.mockReturnValue(mockTenant)
      mockRepository.save.mockResolvedValue(mockTenant)

      const result = await service.create({ name: 'minimal-tenant' })

      expect(result.tenant).toEqual(mockTenant)
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'minimal-tenant',
          description: undefined,
          organization: undefined,
        }),
      )
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

      const result = await service.findOne(1)

      expect(result).toEqual(mockTenant)
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } })
    })

    it('should return null if tenant not found', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      const result = await service.findOne(999)

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

  describe('findByKongUsername', () => {
    it('should find a tenant by Kong username', async () => {
      mockRepository.findOne.mockResolvedValue(mockTenant)

      const result = await service.findByKongUsername('test-tenant')

      expect(result).toEqual(mockTenant)
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { kongUsername: 'test-tenant' },
      })
    })

    it('should return null if tenant not found by Kong username', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      const result = await service.findByKongUsername('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('findByOAuth2ClientId', () => {
    it('should find a tenant by OAuth2 client ID', async () => {
      mockRepository.findOne.mockResolvedValue(mockTenant)

      const result = await service.findByOAuth2ClientId('client-123')

      expect(result).toEqual(mockTenant)
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { oauth2ClientId: 'client-123' },
      })
    })

    it('should return null if tenant not found by OAuth2 client ID', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      const result = await service.findByOAuth2ClientId('nonexistent-client')

      expect(result).toBeNull()
    })
  })

  describe('update', () => {
    it('should update a tenant', async () => {
      const updatedTenant = { ...mockTenant, description: 'Updated description' }
      mockRepository.findOne.mockResolvedValue(mockTenant)
      mockRepository.save.mockResolvedValue(updatedTenant)

      const result = await service.update(1, { description: 'Updated description' })

      expect(result).toEqual(updatedTenant)
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Updated description',
        }),
      )
    })

    it('should throw NotFoundException if tenant does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      await expect(service.update(999, {})).rejects.toThrow(NotFoundException)
    })

    it('should update multiple fields', async () => {
      const updateData = {
        description: 'New description',
        organization: 'New Org',
        contactEmail: 'newemail@test.com',
      }
      const updatedTenant = { ...mockTenant, ...updateData }
      mockRepository.findOne.mockResolvedValue(mockTenant)
      mockRepository.save.mockResolvedValue(updatedTenant)

      const result = await service.update(1, updateData)

      expect(result).toEqual(updatedTenant)
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining(updateData),
      )
    })
  })

  describe('delete', () => {
    it('should delete a tenant', async () => {
      mockRepository.findOne.mockResolvedValue(mockTenant)
      mockRepository.delete.mockResolvedValue({ affected: 1 })

      await service.delete(1)

      expect(mockRepository.delete).toHaveBeenCalledWith(1)
    })

    it('should throw NotFoundException if tenant does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      await expect(service.delete(999)).rejects.toThrow(NotFoundException)
    })

    it('should handle database errors during deletion', async () => {
      mockRepository.findOne.mockResolvedValue(mockTenant)
      mockRepository.delete.mockRejectedValue(new Error('Database error'))

      await expect(service.delete(1)).rejects.toThrow(Error)
    })
  })
})
