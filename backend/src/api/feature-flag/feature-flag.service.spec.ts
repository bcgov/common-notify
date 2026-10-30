import { IsNull } from 'typeorm'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { FeatureFlagService } from './feature-flag.service'
import { FeatureFlag } from './entities/feature-flag.entity'
import { FeatureFlagHistory } from './entities/feature-flag-history.entity'

describe('FeatureFlagService', () => {
  let service: FeatureFlagService

  const mockQueryBuilder = {
    leftJoin: vi.fn().mockReturnThis(),
    leftJoinAndSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    getMany: vi.fn(),
  }

  // Stands in for the EntityManager handed to a transaction callback.
  const mockManager = {
    create: vi.fn((_entity: unknown, data: object) => ({ ...data })),
    save: vi.fn(async (entity: object) => entity),
    findOneOrFail: vi.fn(),
  }

  const mockHistoryRepository = {
    find: vi.fn(),
  }

  const mockFeatureFlagRepository = {
    manager: {
      transaction: vi.fn(async (work: (manager: typeof mockManager) => unknown) =>
        work(mockManager),
      ),
    },
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    findOneOrFail: vi.fn(),
    createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureFlagService,
        {
          provide: getRepositoryToken(FeatureFlag),
          useValue: mockFeatureFlagRepository,
        },
        {
          provide: getRepositoryToken(FeatureFlagHistory),
          useValue: mockHistoryRepository,
        },
      ],
    }).compile()

    service = module.get<FeatureFlagService>(FeatureFlagService)
  })

  afterEach(() => {
    vi.clearAllMocks()
    mockQueryBuilder.getMany.mockReset()
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
        where: { code: 'sms_notifications', tenantId: IsNull() },
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
        where: { code: 'dashboard', tenantId: IsNull() },
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

      mockQueryBuilder.getMany.mockResolvedValue(flags)

      const result = await service.getAll()

      expect(result).toEqual(flags)
      expect(mockFeatureFlagRepository.createQueryBuilder).toHaveBeenCalledWith('ff')
      expect(mockQueryBuilder.getMany).toHaveBeenCalled()
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

      mockQueryBuilder.getMany.mockResolvedValue(flags)

      const result = await service.getFlagsForTenant(tenantId)

      expect(result).toEqual({
        sms_notifications: true, // Tenant override
        sse_notifications: true, // Global
      })
      expect(mockFeatureFlagRepository.createQueryBuilder).toHaveBeenCalledWith('flag')
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'flag.tenantId = :tenantId OR flag.tenantId IS NULL',
        { tenantId },
      )
    })
  })

  describe('create', () => {
    const actor = { id: 'user-123', name: 'Test User' }

    it('creates the flag and records its creation in the same transaction', async () => {
      const dto = { code: 'new_feature', enabled: true, tenantId: null }
      mockManager.save.mockImplementationOnce(async (entity: object) => ({
        id: 'flag-1',
        ...entity,
      }))

      const result = await service.create(dto, actor)

      expect(result).toEqual({ id: 'flag-1', ...dto, createdBy: 'user-123', updatedBy: 'user-123' })
      expect(mockFeatureFlagRepository.manager.transaction).toHaveBeenCalledTimes(1)
      expect(mockManager.create).toHaveBeenCalledWith(FeatureFlagHistory, {
        featureFlagId: 'flag-1',
        code: 'new_feature',
        tenantId: null,
        enabled: true,
        createdBy: 'user-123',
        createdByName: 'Test User',
      })
      expect(mockManager.save).toHaveBeenCalledTimes(2)
    })
  })

  describe('update', () => {
    const actor = { id: 'user-456', name: 'Other User' }
    const existing = (): FeatureFlag => ({
      id: '1',
      code: 'sms_notifications',
      enabled: true,
      tenantId: null,
      createdAt: new Date(),
      createdBy: 'user-123',
      updatedAt: new Date(),
      updatedBy: 'user-123',
    })

    it('updates the flag under a row lock and records the change', async () => {
      mockManager.findOneOrFail.mockResolvedValue(existing())

      const result = await service.update('1', { enabled: false }, actor)

      expect(result.enabled).toBe(false)
      expect(result.updatedBy).toBe('user-456')
      expect(mockManager.findOneOrFail).toHaveBeenCalledWith(FeatureFlag, {
        where: { id: '1' },
        lock: { mode: 'pessimistic_write' },
      })
      expect(mockManager.create).toHaveBeenCalledWith(FeatureFlagHistory, {
        featureFlagId: '1',
        code: 'sms_notifications',
        tenantId: null,
        enabled: false,
        createdBy: 'user-456',
        createdByName: 'Other User',
      })
    })

    it('records nothing when the value does not change', async () => {
      mockManager.findOneOrFail.mockResolvedValue(existing())

      await service.update('1', { enabled: true }, actor)

      expect(mockManager.save).toHaveBeenCalledTimes(1)
      expect(mockManager.create).not.toHaveBeenCalledWith(FeatureFlagHistory, expect.anything())
    })
  })

  describe('getHistory', () => {
    it('returns the flag history newest first', async () => {
      const history = [{ id: 'h1' }]
      mockHistoryRepository.find.mockResolvedValue(history)

      await expect(service.getHistory('1')).resolves.toBe(history)
      expect(mockHistoryRepository.find).toHaveBeenCalledWith({
        where: { featureFlagId: '1' },
        order: { createdAt: 'DESC' },
      })
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
        where: { code, tenantId: IsNull() },
      })
    })
  })
})
