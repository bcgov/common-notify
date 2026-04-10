import { Test, TestingModule } from '@nestjs/testing'
import { HttpException } from '@nestjs/common'
import { vi } from 'vitest'
import { TenantsController } from './tenants.controller'
import { TenantsService } from './tenants.service'

describe('TenantsController', () => {
  let controller: TenantsController
  let service: TenantsService

  const mockTenant = {
    id: 1,
    name: 'test-tenant',
    description: 'Test tenant',
    organization: 'Test Org',
    contactEmail: 'contact@test.com',
    contactName: 'John Doe',
    kongUsername: 'test-tenant',
    status: 'active',
  }

  const mockService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantsController],
      providers: [
        {
          provide: TenantsService,
          useValue: mockService,
        },
      ],
    }).compile()

    controller = module.get<TenantsController>(TenantsController)
    service = module.get<TenantsService>(TenantsService)
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('should create a new tenant', async () => {
      const createDto = {
        name: 'test-tenant',
        description: 'Test tenant',
        organization: 'Test Org',
        contactEmail: 'contact@test.com',
        contactName: 'John Doe',
      }

      mockService.create.mockResolvedValue({ tenant: mockTenant })

      const result = await controller.create(createDto)

      expect(result).toEqual({ tenant: mockTenant })
      expect(mockService.create).toHaveBeenCalledWith(createDto)
    })

    it('should handle creation errors', async () => {
      const createDto = { name: 'test-tenant' }
      mockService.create.mockRejectedValue(new Error('Creation failed'))

      await expect(controller.create(createDto)).rejects.toThrow(HttpException)
    })
  })

  describe('findAll', () => {
    it('should return all tenants', async () => {
      const allTenants = [mockTenant, { ...mockTenant, id: 2, name: 'tenant-2' }]
      mockService.findAll.mockResolvedValue(allTenants)

      const result = await controller.findAll()

      expect(result).toEqual(allTenants)
      expect(mockService.findAll).toHaveBeenCalled()
    })

    it('should return empty array if no tenants', async () => {
      mockService.findAll.mockResolvedValue([])

      const result = await controller.findAll()

      expect(result).toEqual([])
    })
  })

  describe('findOne', () => {
    it('should find a tenant by ID', async () => {
      mockService.findOne.mockResolvedValue(mockTenant)

      const result = await controller.findOne('1')

      expect(result).toEqual(mockTenant)
      expect(mockService.findOne).toHaveBeenCalledWith(1)
    })

    it('should throw HttpException if tenant not found', async () => {
      mockService.findOne.mockResolvedValue(null)

      await expect(controller.findOne('999')).rejects.toThrow(HttpException)
    })

    it('should parse string ID to number', async () => {
      mockService.findOne.mockResolvedValue(mockTenant)

      await controller.findOne('42')

      expect(mockService.findOne).toHaveBeenCalledWith(42)
    })
  })

  describe('delete', () => {
    it('should delete a tenant', async () => {
      mockService.delete.mockResolvedValue(undefined)

      await expect(controller.delete('1')).resolves.not.toThrow()

      expect(mockService.delete).toHaveBeenCalledWith(1)
    })

    it('should handle deletion errors', async () => {
      mockService.delete.mockRejectedValue(new Error('Deletion failed'))

      await expect(controller.delete('1')).rejects.toThrow(HttpException)
    })

    it('should parse string ID to number', async () => {
      mockService.delete.mockResolvedValue(undefined)

      await controller.delete('99')

      expect(mockService.delete).toHaveBeenCalledWith(99)
    })
  })
})
