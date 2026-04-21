import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PendingNotificationRetryService } from './pending-notification-retry.service'
import { NotificationRequest } from '../../notification/entities/notification-request.entity'
import { NotificationService } from '../../notification/notification.service'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { QueueName } from '../../enum/queue-name.enum'

describe('PendingNotificationRetryService', () => {
  let service: PendingNotificationRetryService
  let module: TestingModule
  let mockRepository: any
  let mockNotificationService: any
  let mockQueue: any

  beforeEach(async () => {
    mockRepository = { find: vi.fn() }
    mockNotificationService = { update: vi.fn() }
    mockQueue = { add: vi.fn().mockResolvedValue({ id: 'job-123' }), name: 'ingestion' }

    module = await Test.createTestingModule({
      providers: [
        PendingNotificationRetryService,
        { provide: getRepositoryToken(NotificationRequest), useValue: mockRepository },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: QueueName.INGESTION, useValue: mockQueue },
      ],
    }).compile()

    service = module.get<PendingNotificationRetryService>(PendingNotificationRetryService)
    vi.spyOn(service['logger'], 'debug').mockImplementation(() => {})
    vi.spyOn(service['logger'], 'log').mockImplementation(() => {})
    vi.spyOn(service['logger'], 'warn').mockImplementation(() => {})
    vi.spyOn(service['logger'], 'error').mockImplementation(() => {})
  })

  afterEach(async () => {
    if (service?.['retryInterval']) clearInterval(service['retryInterval'])
    await module.close()
  })

  describe('retryPendingNotifications', () => {
    it('should handle no pending notifications', async () => {
      mockRepository.find.mockResolvedValue([])
      await service.retryPendingNotifications()
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { status: NotificationStatus.PENDING },
      })
      expect(mockQueue.add).not.toHaveBeenCalled()
    })

    it('should retry all pending notifications', async () => {
      const notifications = [
        {
          id: 'notify-1',
          tenantId: 'tenant-1',
          status: NotificationStatus.PENDING,
          payload: { email: 'test@example.com' },
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
        {
          id: 'notify-2',
          tenantId: 'tenant-2',
          status: NotificationStatus.PENDING,
          payload: { phone: '+11234567890' },
          createdAt: new Date('2024-01-01T11:00:00Z'),
        },
      ]
      mockRepository.find.mockResolvedValue(notifications)
      mockQueue.add.mockResolvedValue({ id: 'job-123' })
      mockNotificationService.update.mockResolvedValue({})
      await service.retryPendingNotifications()
      expect(mockQueue.add).toHaveBeenCalledTimes(2)
      expect(mockNotificationService.update).toHaveBeenCalledTimes(2)
    })

    it('should handle partial failures', async () => {
      const notifications = [
        {
          id: 'notify-1',
          tenantId: 'tenant-1',
          status: NotificationStatus.PENDING,
          payload: { email: 'test@example.com' },
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
        {
          id: 'notify-2',
          tenantId: 'tenant-2',
          status: NotificationStatus.PENDING,
          payload: { phone: '+11234567890' },
          createdAt: new Date('2024-01-01T11:00:00Z'),
        },
      ]
      mockRepository.find.mockResolvedValue(notifications)
      mockQueue.add.mockResolvedValueOnce({ id: 'job-123' })
      mockQueue.add.mockRejectedValueOnce(new Error('Redis error'))
      mockNotificationService.update.mockResolvedValue({})
      await service.retryPendingNotifications()
      expect(mockQueue.add).toHaveBeenCalledTimes(2)
      expect(mockNotificationService.update).toHaveBeenCalledTimes(1)
      expect(service['logger'].warn).toHaveBeenCalled()
    })

    it('should handle update failure', async () => {
      const notifications = [
        {
          id: 'notify-1',
          tenantId: 'tenant-1',
          status: NotificationStatus.PENDING,
          payload: { email: 'test@example.com' },
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
      ]
      mockRepository.find.mockResolvedValue(notifications)
      mockQueue.add.mockResolvedValue({ id: 'job-123' })
      mockNotificationService.update.mockRejectedValue(new Error('DB error'))
      await service.retryPendingNotifications()
      expect(service['logger'].warn).toHaveBeenCalled()
    })

    it('should handle repository error', async () => {
      mockRepository.find.mockRejectedValue(new Error('Connection failed'))
      await service.retryPendingNotifications()
      expect(service['logger'].error).toHaveBeenCalled()
    })

    it('should handle null payload', async () => {
      const notifications = [
        {
          id: 'notify-1',
          tenantId: 'tenant-1',
          status: NotificationStatus.PENDING,
          payload: null,
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
      ]
      mockRepository.find.mockResolvedValue(notifications)
      mockQueue.add.mockResolvedValue({ id: 'job-123' })
      mockNotificationService.update.mockResolvedValue({})
      await service.retryPendingNotifications()
      expect(mockQueue.add).toHaveBeenCalledWith(
        'process',
        expect.objectContaining({ request: {} }),
        expect.any(Object),
      )
    })

    it('should log stats', async () => {
      const notifications = [
        {
          id: 'notify-1',
          tenantId: 'tenant-1',
          status: NotificationStatus.PENDING,
          payload: { email: 'test@example.com' },
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
      ]
      mockRepository.find.mockResolvedValue(notifications)
      mockQueue.add.mockResolvedValue({ id: 'job-123' })
      mockNotificationService.update.mockResolvedValue({})
      await service.retryPendingNotifications()
      expect(service['logger'].log).toHaveBeenCalledWith(
        expect.stringMatching(/1 succeeded, 0 failed/),
      )
    })
  })

  describe('onApplicationBootstrap', () => {
    it('should start interval with default config', () => {
      mockRepository.find.mockResolvedValue([])
      service.onApplicationBootstrap()
      expect(service['retryInterval']).toBeDefined()
      expect(service['logger'].log).toHaveBeenCalledWith(
        expect.stringContaining('Starting pending notification retry job'),
      )
    })

    it('should use custom interval from env', () => {
      const originalEnv = process.env.PENDING_RETRY_INTERVAL
      process.env.PENDING_RETRY_INTERVAL = '60000'
      mockRepository.find.mockResolvedValue([])
      service.onApplicationBootstrap()
      expect(service['logger'].log).toHaveBeenCalledWith(expect.stringContaining('60000'))
      process.env.PENDING_RETRY_INTERVAL = originalEnv
    })
  })

  describe('onModuleDestroy', () => {
    it('should clear interval when one exists', () => {
      mockRepository.find.mockResolvedValue([])
      service.onApplicationBootstrap()
      expect(service['retryInterval']).toBeDefined()
      service.onModuleDestroy()
      expect(service['logger'].log).toHaveBeenCalledWith(expect.stringContaining('stopped'))
    })

    it('should handle destroy when no interval', () => {
      service.onModuleDestroy()
      expect(true).toBe(true)
    })
  })

  describe('job configuration', () => {
    it('should configure jobs with retry and backoff', async () => {
      const notifications = [
        {
          id: 'notify-1',
          tenantId: 'tenant-1',
          status: NotificationStatus.PENDING,
          payload: { email: 'test@example.com' },
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
      ]
      mockRepository.find.mockResolvedValue(notifications)
      mockQueue.add.mockResolvedValue({ id: 'job-123' })
      mockNotificationService.update.mockResolvedValue({})
      await service.retryPendingNotifications()
      const jobConfig = mockQueue.add.mock.calls[0][2]
      expect(jobConfig.attempts).toBe(3)
      expect(jobConfig.backoff).toEqual({ type: 'exponential', delay: 2000 })
      expect(jobConfig.removeOnComplete).toBe(false)
      expect(jobConfig.removeOnFail).toBe(false)
    })

    it('should use notification id as job id', async () => {
      const notifications = [
        {
          id: 'my-unique-id',
          tenantId: 'tenant-1',
          status: NotificationStatus.PENDING,
          payload: { email: 'test@example.com' },
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
      ]
      mockRepository.find.mockResolvedValue(notifications)
      mockQueue.add.mockResolvedValue({ id: 'job-123' })
      mockNotificationService.update.mockResolvedValue({})
      await service.retryPendingNotifications()
      const jobConfig = mockQueue.add.mock.calls[0][2]
      expect(jobConfig.jobId).toBe('my-unique-id')
    })

    it('should include all required fields in job data', async () => {
      const notifications = [
        {
          id: 'notify-1',
          tenantId: 'tenant-1',
          status: NotificationStatus.PENDING,
          payload: { email: 'test@example.com', subject: 'Test' },
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
      ]
      mockRepository.find.mockResolvedValue(notifications)
      mockQueue.add.mockResolvedValue({ id: 'job-123' })
      mockNotificationService.update.mockResolvedValue({})
      await service.retryPendingNotifications()
      const jobData = mockQueue.add.mock.calls[0][1]
      expect(jobData).toHaveProperty('notifyId', 'notify-1')
      expect(jobData).toHaveProperty('recordId', 'notify-1')
      expect(jobData).toHaveProperty('tenantId', 'tenant-1')
      expect(jobData).toHaveProperty('request')
      expect(jobData).toHaveProperty('requestedAt')
    })
  })
})
