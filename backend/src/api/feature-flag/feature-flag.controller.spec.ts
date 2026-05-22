import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { FeatureFlagController, FeatureFlagClientController } from './feature-flag.controller'
import { FeatureFlagService } from './feature-flag.service'
import { FeatureFlag } from './entities/feature-flag.entity'
import { CreateFeatureFlagDto } from './schemas/create-feature-flag.dto'
import { UpdateFeatureFlagDto } from './schemas/update-feature-flag.dto'

describe('FeatureFlagController', () => {
  let controller: FeatureFlagController

  const mockFeatureFlagService = {
    create: vi.fn(),
    getAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getById: vi.fn(),
    getByCodeAndTenant: vi.fn(),
    getFlagsForTenant: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeatureFlagController],
      providers: [
        {
          provide: FeatureFlagService,
          useValue: mockFeatureFlagService,
        },
      ],
    }).compile()

    controller = module.get<FeatureFlagController>(FeatureFlagController)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('POST create', () => {
    it('should create a new feature flag successfully', async () => {
      const dto: CreateFeatureFlagDto = {
        code: 'new_feature',
        enabled: true,
        tenantId: null,
      }

      const created: FeatureFlag = {
        id: '1',
        code: 'new_feature',
        enabled: true,
        tenantId: null,
        createdAt: new Date(),
        createdBy: 'admin-user',
        updatedAt: new Date(),
        updatedBy: 'admin-user',
      }

      mockFeatureFlagService.getByCodeAndTenant.mockResolvedValue(null)
      mockFeatureFlagService.create.mockResolvedValue(created)

      const result = await controller.create(dto)

      expect(result).toEqual(created)
      expect(mockFeatureFlagService.create).toHaveBeenCalledWith(dto, 'admin-user')
    })

    it('should throw BadRequestException for empty code', async () => {
      const dto: CreateFeatureFlagDto = {
        code: '',
        enabled: true,
      }

      await expect(controller.create(dto)).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when flag already exists', async () => {
      const dto: CreateFeatureFlagDto = {
        code: 'sms_notifications',
        enabled: true,
        tenantId: null,
      }

      const existing: FeatureFlag = {
        id: '1',
        code: 'sms_notifications',
        enabled: false,
        tenantId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockFeatureFlagService.getByCodeAndTenant.mockResolvedValue(existing)

      await expect(controller.create(dto)).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when tenant override already exists', async () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000'
      const dto: CreateFeatureFlagDto = {
        code: 'sms_notifications',
        enabled: true,
        tenantId,
      }

      const existing: FeatureFlag = {
        id: '1',
        code: 'sms_notifications',
        enabled: false,
        tenantId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockFeatureFlagService.getByCodeAndTenant.mockResolvedValue(existing)

      await expect(controller.create(dto)).rejects.toThrow(BadRequestException)
    })
  })

  describe('GET getAll', () => {
    it('should return all feature flags', async () => {
      const flags: FeatureFlag[] = [
        {
          id: '1',
          code: 'sms_notifications',
          enabled: false,
          tenantId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          code: 'dashboard',
          enabled: true,
          tenantId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      mockFeatureFlagService.getAll.mockResolvedValue(flags)

      const result = await controller.getAll()

      expect(result).toEqual(flags)
      expect(mockFeatureFlagService.getAll).toHaveBeenCalled()
    })

    it('should return empty array when no flags exist', async () => {
      mockFeatureFlagService.getAll.mockResolvedValue([])

      const result = await controller.getAll()

      expect(result).toEqual([])
    })
  })

  describe('PATCH update', () => {
    it('should update a feature flag successfully', async () => {
      const id = '1'
      const dto: UpdateFeatureFlagDto = { enabled: false }

      const existing: FeatureFlag = {
        id,
        code: 'sms_notifications',
        enabled: true,
        tenantId: null,
        createdAt: new Date(),
        createdBy: 'admin-user',
        updatedAt: new Date(),
        updatedBy: 'admin-user',
      }

      const updated: FeatureFlag = {
        ...existing,
        enabled: false,
        updatedBy: 'admin-user',
        updatedAt: new Date(),
      }

      mockFeatureFlagService.getById.mockResolvedValue(existing)
      mockFeatureFlagService.update.mockResolvedValue(updated)

      const result = await controller.update(id, dto)

      expect(result).toEqual(updated)
      expect(mockFeatureFlagService.update).toHaveBeenCalledWith(id, dto, 'admin-user')
    })

    it('should throw BadRequestException for empty ID', async () => {
      const dto: UpdateFeatureFlagDto = { enabled: false }

      await expect(controller.update('', dto)).rejects.toThrow(BadRequestException)
    })

    it('should throw NotFoundException when flag does not exist', async () => {
      const id = 'non-existent-id'
      const dto: UpdateFeatureFlagDto = { enabled: false }

      mockFeatureFlagService.getById.mockResolvedValue(null)

      await expect(controller.update(id, dto)).rejects.toThrow(NotFoundException)
    })
  })

  describe('DELETE delete', () => {
    it('should delete a feature flag successfully', async () => {
      const id = '1'
      const flag: FeatureFlag = {
        id,
        code: 'sms_notifications',
        enabled: true,
        tenantId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockFeatureFlagService.getById.mockResolvedValue(flag)
      mockFeatureFlagService.delete.mockResolvedValue(undefined)

      const result = await controller.delete(id)

      expect(result).toEqual({ message: `Feature flag "${flag.code}" has been deleted` })
      expect(mockFeatureFlagService.delete).toHaveBeenCalledWith(id)
    })

    it('should throw BadRequestException for empty ID', async () => {
      await expect(controller.delete('')).rejects.toThrow(BadRequestException)
    })

    it('should throw NotFoundException when flag does not exist', async () => {
      const id = 'non-existent-id'

      mockFeatureFlagService.getById.mockResolvedValue(null)

      await expect(controller.delete(id)).rejects.toThrow(NotFoundException)
    })
  })

  describe('GET getForTenant (client endpoint)', () => {
    let clientController: FeatureFlagClientController

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [FeatureFlagClientController],
        providers: [
          {
            provide: FeatureFlagService,
            useValue: mockFeatureFlagService,
          },
        ],
      }).compile()

      clientController = module.get<FeatureFlagClientController>(FeatureFlagClientController)
    })

    it('should return feature flags for tenant', async () => {
      const flags: Record<string, boolean> = {
        sms_notifications: true,
        sse_notifications: true,
        dashboard: false,
      }

      mockFeatureFlagService.getFlagsForTenant.mockResolvedValue(flags)

      const mockReq = {
        tenant: { id: 'tenant-123', name: 'Test Tenant' },
        headers: { authorization: 'Bearer token' },
      } as unknown as any

      const result = await clientController.getForTenant(mockReq)

      expect(result).toEqual(flags)
    })

    it('should return empty object on error', async () => {
      mockFeatureFlagService.getFlagsForTenant.mockRejectedValue(new Error('Database error'))

      const mockReq = {
        tenant: { id: 'tenant-123', name: 'Test Tenant' },
        headers: { authorization: 'Bearer token' },
      } as unknown as any

      const result = await clientController.getForTenant(mockReq)

      expect(result).toEqual({})
    })
  })
})
