import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NotificationService } from './notification.service'
import { NotificationRequest } from './entities/notification-request.entity'
import { NotificationStatus } from './schemas'
import { TenantsService } from '../admin/tenants/tenants.service'

const mockRepository = {
  create: vi.fn(),
  save: vi.fn(),
  find: vi.fn(),
  findOne: vi.fn(),
  findAndCount: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
}

const mockConfigService = {
  get: vi.fn().mockReturnValue(undefined),
}

const mockTenantsService = {
  findOne: vi.fn(),
}

describe('NotificationService', () => {
  let service: NotificationService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: getRepositoryToken(NotificationRequest),
          useValue: mockRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: TenantsService,
          useValue: mockTenantsService,
        },
      ],
    }).compile()

    service = module.get<NotificationService>(NotificationService)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('create', () => {
    it('should create and save a notification request', async () => {
      const dto = { tenantId: 'tenant-uuid', createdBy: 'user1' }
      const mockNotification = {
        id: 'notif-uuid',
        tenantId: 'tenant-uuid',
        status: NotificationStatus.QUEUED,
        createdBy: 'user1',
      }
      mockRepository.create.mockReturnValue(mockNotification)
      mockRepository.save.mockResolvedValue(mockNotification)

      const result = await service.create(dto)

      expect(mockRepository.create).toHaveBeenCalledWith({
        tenantId: dto.tenantId,
        status: NotificationStatus.QUEUED,
        createdBy: dto.createdBy,
      })
      expect(mockRepository.save).toHaveBeenCalledWith(mockNotification)
      expect(result).toEqual(mockNotification)
    })

    it('should use provided status when specified', async () => {
      const dto = {
        tenantId: 'tenant-uuid',
        status: NotificationStatus.PROCESSING,
        createdBy: 'user1',
      }
      const mockNotification = { id: 'notif-uuid', ...dto }
      mockRepository.create.mockReturnValue(mockNotification)
      mockRepository.save.mockResolvedValue(mockNotification)

      await service.create(dto)

      expect(mockRepository.create).toHaveBeenCalledWith({
        tenantId: dto.tenantId,
        status: NotificationStatus.PROCESSING,
        createdBy: dto.createdBy,
      })
    })
  })

  describe('findAll', () => {
    it('should return paginated notifications', async () => {
      const mockNotifications = [
        { id: 'notif-1', tenantId: 'tenant-uuid', status: NotificationStatus.QUEUED },
        { id: 'notif-2', tenantId: 'tenant-uuid', status: NotificationStatus.QUEUED },
      ]
      mockRepository.findAndCount.mockResolvedValue([mockNotifications, 2])

      const result = await service.findAll(1, 10)

      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 10,
        order: { createdAt: 'DESC' },
      })
      expect(result.count).toBe(2)
      expect(result.page).toBe(1)
      expect(result.limit).toBe(10)
      expect(result.totalPages).toBe(1)
    })

    it('should return empty data array when no notifications exist', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0])

      const result = await service.findAll(1, 10)

      expect(result.data).toEqual([])
      expect(result.count).toBe(0)
    })

    it('should filter by status when provided', async () => {
      const mockNotifications = [
        { id: 'notif-1', tenantId: 'tenant-uuid', status: NotificationStatus.COMPLETED },
      ]
      mockRepository.findAndCount.mockResolvedValue([mockNotifications, 1])

      await service.findAll(1, 10, NotificationStatus.COMPLETED)

      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        where: { status: NotificationStatus.COMPLETED },
        skip: 0,
        take: 10,
        order: { createdAt: 'DESC' },
      })
    })

    it('should calculate totalPages correctly', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 25])

      const result = await service.findAll(1, 10)

      expect(result.totalPages).toBe(3)
    })
  })

  describe('findOne', () => {
    it('should return a notification when found', async () => {
      const id = 'notif-uuid'
      const tenantId = 'tenant-uuid'
      const mockNotification = { id, tenantId }
      mockRepository.findOne.mockResolvedValue(mockNotification)

      const result = await service.findOne(id, tenantId)

      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id, tenantId } })
      expect(result).toEqual(mockNotification)
    })

    it('should throw NotFoundException when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      await expect(service.findOne('missing-id', 'tenant-uuid')).rejects.toThrow(NotFoundException)
    })

    it('should include the id in the NotFoundException message', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      await expect(service.findOne('missing-id', 'tenant-uuid')).rejects.toThrow(
        "Notification request with id 'missing-id' not found",
      )
    })
  })

  describe('update', () => {
    it('should update status and return the notification', async () => {
      const id = 'notif-uuid'
      const tenantId = 'tenant-uuid'
      const existing = {
        id,
        tenantId,
        status: NotificationStatus.QUEUED,
        updatedBy: null,
      }
      const dto = { status: NotificationStatus.COMPLETED, updatedBy: 'admin' }
      const updated = { ...existing, ...dto }
      mockRepository.findOne.mockResolvedValueOnce(existing)
      mockRepository.update.mockResolvedValue({ affected: 1 })
      mockRepository.findOne.mockResolvedValueOnce(updated)

      const result = await service.update(id, tenantId, dto)

      expect(mockRepository.update).toHaveBeenCalledWith({ id, tenantId }, dto)
      expect(result).toEqual(updated)
    })

    it('should only update provided fields', async () => {
      const id = 'notif-uuid'
      const tenantId = 'tenant-uuid'
      const existing = {
        id,
        tenantId,
        status: NotificationStatus.QUEUED,
        updatedBy: null,
      }
      const updated = { ...existing, updatedBy: 'admin' }
      mockRepository.findOne.mockResolvedValueOnce(existing)
      mockRepository.update.mockResolvedValue({ affected: 1 })
      mockRepository.findOne.mockResolvedValueOnce(updated)

      await service.update(id, tenantId, { updatedBy: 'admin' })

      expect(mockRepository.update).toHaveBeenCalledWith({ id, tenantId }, { updatedBy: 'admin' })
    })

    it('should throw NotFoundException when notification not found', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      await expect(service.update('missing-id', 'tenant-uuid', {})).rejects.toThrow(
        NotFoundException,
      )
    })
  })
})
