import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { FeatureFlagService } from './feature-flag.service'
import { FeatureFlag } from './entities/feature-flag.entity'

describe('FeatureFlagService', () => {
  let service: FeatureFlagService

  const mockFeatureFlagRepository = {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    findOneOrFail: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureFlagService,
        {
          provide: getRepositoryToken(FeatureFlag),
          useValue: mockFeatureFlagRepository,
        },
      ],
    }).compile()

    service = module.get<FeatureFlagService>(FeatureFlagService)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('isEnabled', () => {
    it('should return true when tenant-specific flag is enabled', async () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000'
      const flag: FeatureFlag = {
        id: '1',
        code: 'sms_notifications',
        enabled: true,
        tenantId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockFeatureFlagRepository.findOne.mockResolvedValue(flag)

      const result = await service.isEnabled('sms_notifications', tenantId)

      expect(result).toBe(true)
      expect(mockFeatureFlagRepository.findOne).toHaveBeenCalledWith({
        where: { code: 'sms_notifications', tenantId },
      })
    })

    it('should fall back to global flag when tenant override not found', async () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000'
      const globalFlag: FeatureFlag = {
        id: '2',
        code: 'sms_notifications',
        enabled: false,
        tenantId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // First call (tenant-specific) returns null
      // Second call (global) returns the flag
      mockFeatureFlagRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(globalFlag)

      const result = await service.isEnabled('sms_notifications', tenantId)

      expect(result).toBe(false)
      expect(mockFeatureFlagRepository.findOne).toHaveBeenCalledTimes(2)
      expect(mockFeatureFlagRepository.findOne).toHaveBeenLastCalledWith({
        where: { code: 'sms_notifications', tenantId: null },
      })
    })

    it('should return false as default when flag does not exist', async () => {
      mockFeatureFlagRepository.findOne.mockResolvedValue(null)

      const result = await service.isEnabled('non_existent_flag', 'tenant-123')

      expect(result).toBe(false)
    })

    it('should return true for global flag when tenantId is not provided', async () => {
      const globalFlag: FeatureFlag = {
        id: '3',
        code: 'dashboard',
        enabled: true,
        tenantId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockFeatureFlagRepository.findOne.mockResolvedValue(globalFlag)

      const result = await service.isEnabled('dashboard')

      expect(result).toBe(true)
      expect(mockFeatureFlagRepository.findOne).toHaveBeenCalledWith({
        where: { code: 'dashboard', tenantId: null },
      })
    })

    it('should return false on error and log the error', async () => {
      mockFeatureFlagRepository.findOne.mockRejectedValue(new Error('Database error'))

      const result = await service.isEnabled('sms_notifications', 'tenant-123')

      expect(result).toBe(false)
    })
  })

  describe('getAll', () => {
    it('should return all feature flags sorted by code', async () => {
      const flags: FeatureFlag[] = [
        {
          id: '1',
          code: 'dashboard',
          enabled: true,
          tenantId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          code: 'sms_notifications',
          enabled: false,
          tenantId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      mockFeatureFlagRepository.find.mockResolvedValue(flags)

      const result = await service.getAll()

      expect(result).toEqual(flags)
      expect(mockFeatureFlagRepository.find).toHaveBeenCalledWith({
        order: { code: 'ASC', tenantId: 'ASC' },
      })
    })
  })

  describe('getFlagsForTenant', () => {
    it('should return flags for tenant with overrides taking precedence', async () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000'
      const flags: FeatureFlag[] = [
        // Global flags
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
          code: 'sse_notifications',
          enabled: true,
          tenantId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        // Tenant-specific override
        {
          id: '3',
          code: 'sms_notifications',
          enabled: true,
          tenantId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      mockFeatureFlagRepository.find.mockResolvedValue(flags)

      const result = await service.getFlagsForTenant(tenantId)

      expect(result).toEqual({
        sms_notifications: true, // Tenant override
        sse_notifications: true, // Global
      })
    })
  })

  describe('create', () => {
    it('should create a new feature flag', async () => {
      const dto = {
        code: 'new_feature',
        enabled: true,
        tenantId: null,
      }

      const created: FeatureFlag = {
        id: '1',
        ...dto,
        createdAt: new Date(),
        createdBy: 'user-123',
        updatedAt: new Date(),
        updatedBy: 'user-123',
      }

      mockFeatureFlagRepository.create.mockReturnValue(created)
      mockFeatureFlagRepository.save.mockResolvedValue(created)

      const result = await service.create(dto, 'user-123')

      expect(result).toEqual(created)
      expect(mockFeatureFlagRepository.create).toHaveBeenCalledWith({
        ...dto,
        createdBy: 'user-123',
        updatedBy: 'user-123',
      })
      expect(mockFeatureFlagRepository.save).toHaveBeenCalledWith(created)
    })
  })

  describe('update', () => {
    it('should update a feature flag', async () => {
      const id = '1'
      const dto = { enabled: false }
      const existing: FeatureFlag = {
        id,
        code: 'sms_notifications',
        enabled: true,
        tenantId: null,
        createdAt: new Date(),
        createdBy: 'user-123',
        updatedAt: new Date(),
        updatedBy: 'user-123',
      }

      const updated: FeatureFlag = {
        ...existing,
        enabled: false,
        updatedBy: 'user-456',
        updatedAt: new Date(),
      }

      mockFeatureFlagRepository.findOneOrFail.mockResolvedValue(existing)
      mockFeatureFlagRepository.save.mockResolvedValue(updated)

      const result = await service.update(id, dto, 'user-456')

      expect(result.enabled).toBe(false)
      expect(result.updatedBy).toBe('user-456')
    })
  })

  describe('delete', () => {
    it('should delete a feature flag by id', async () => {
      const id = '1'

      mockFeatureFlagRepository.delete.mockResolvedValue({ affected: 1 })

      await service.delete(id)

      expect(mockFeatureFlagRepository.delete).toHaveBeenCalledWith(id)
    })
  })

  describe('getById', () => {
    it('should return a feature flag by id', async () => {
      const id = '1'
      const flag: FeatureFlag = {
        id,
        code: 'sms_notifications',
        enabled: true,
        tenantId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockFeatureFlagRepository.findOne.mockResolvedValue(flag)

      const result = await service.getById(id)

      expect(result).toEqual(flag)
      expect(mockFeatureFlagRepository.findOne).toHaveBeenCalledWith({ where: { id } })
    })

    it('should return null when flag not found', async () => {
      mockFeatureFlagRepository.findOne.mockResolvedValue(null)

      const result = await service.getById('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('getByCodeAndTenant', () => {
    it('should return a flag by code and tenantId', async () => {
      const code = 'sms_notifications'
      const tenantId = '550e8400-e29b-41d4-a716-446655440000'
      const flag: FeatureFlag = {
        id: '1',
        code,
        enabled: true,
        tenantId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockFeatureFlagRepository.findOne.mockResolvedValue(flag)

      const result = await service.getByCodeAndTenant(code, tenantId)

      expect(result).toEqual(flag)
      expect(mockFeatureFlagRepository.findOne).toHaveBeenCalledWith({
        where: { code, tenantId },
      })
    })

    it('should treat undefined tenantId as null (global flag)', async () => {
      const code = 'dashboard'
      const flag: FeatureFlag = {
        id: '2',
        code,
        enabled: true,
        tenantId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockFeatureFlagRepository.findOne.mockResolvedValue(flag)

      const result = await service.getByCodeAndTenant(code)

      expect(result).toEqual(flag)
      expect(mockFeatureFlagRepository.findOne).toHaveBeenCalledWith({
        where: { code, tenantId: null },
      })
    })
  })
})
