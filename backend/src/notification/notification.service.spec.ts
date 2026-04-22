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
    it('should return all notifications for a tenant', async () => {
      const tenantId = 'tenant-uuid'
      const mockNotifications = [
        { id: 'notif-1', tenantId },
        { id: 'notif-2', tenantId },
      ]
      mockRepository.find.mockResolvedValue(mockNotifications)

      const result = await service.findAll(tenantId)

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { tenantId },
        order: { createdAt: 'DESC' },
      })
      expect(result).toEqual(mockNotifications)
    })

    it('should return empty array when no notifications exist', async () => {
      mockRepository.find.mockResolvedValue([])

      const result = await service.findAll('tenant-uuid')

      expect(result).toEqual([])
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
      const existing = { id, tenantId, status: NotificationStatus.QUEUED, updatedBy: null }
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
      const existing = { id, tenantId, status: NotificationStatus.QUEUED, updatedBy: null }
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

  describe('remove', () => {
    it('should remove the notification', async () => {
      const id = 'notif-uuid'
      const tenantId = 'tenant-uuid'
      const mockNotification = { id, tenantId }
      mockRepository.findOne.mockResolvedValue(mockNotification)
      mockRepository.remove.mockResolvedValue(undefined)

      await service.remove(id, tenantId)

      expect(mockRepository.remove).toHaveBeenCalledWith(mockNotification)
    })

    it('should throw NotFoundException when notification not found', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      await expect(service.remove('missing-id', 'tenant-uuid')).rejects.toThrow(NotFoundException)
    })
  })
})
