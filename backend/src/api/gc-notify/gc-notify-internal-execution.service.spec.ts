import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { BadRequestException } from '@nestjs/common'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GcNotifyInternalExecutionService } from './gc-notify-internal-execution.service'
import { TemplatesRepository } from '../templates/templates.repository'
import { TemplatesService } from '../templates/templates.service'
import { NotificationService } from '../notification/notification.service'
import { NotificationRequestDetailService } from '../notification/notification-request-detail.service'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import { QueueName } from '../../enum/queue-name.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve))

describe('GcNotifyInternalExecutionService', () => {
  let service: GcNotifyInternalExecutionService
  let mockTemplatesRepository: { findById: ReturnType<typeof vi.fn> }
  let mockTemplatesService: {
    renderTemplateContent: ReturnType<typeof vi.fn>
    getTemplate: ReturnType<typeof vi.fn>
    listTemplates: ReturnType<typeof vi.fn>
  }
  let mockNotificationService: {
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    findOne: ReturnType<typeof vi.fn>
    findAll: ReturnType<typeof vi.fn>
  }
  let mockNotificationRequestDetailService: {
    createPending: ReturnType<typeof vi.fn>
    updateStatus: ReturnType<typeof vi.fn>
  }
  let mockConfigurationRepository: { findOne: ReturnType<typeof vi.fn> }
  let mockIngestionQueue: { add: ReturnType<typeof vi.fn> }

  const TENANT_ID = 'tenant-1'

  beforeEach(async () => {
    mockTemplatesRepository = { findById: vi.fn() }
    mockTemplatesService = {
      renderTemplateContent: vi.fn(),
      getTemplate: vi.fn(),
      listTemplates: vi.fn(),
    }
    mockNotificationService = {
      create: vi.fn(),
      update: vi.fn(),
      findOne: vi.fn(),
      findAll: vi.fn(),
    }
    mockNotificationRequestDetailService = { createPending: vi.fn(), updateStatus: vi.fn() }
    mockConfigurationRepository = { findOne: vi.fn().mockResolvedValue(null) }
    mockIngestionQueue = { add: vi.fn().mockResolvedValue(undefined) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GcNotifyInternalExecutionService,
        { provide: TemplatesRepository, useValue: mockTemplatesRepository },
        { provide: TemplatesService, useValue: mockTemplatesService },
        { provide: NotificationService, useValue: mockNotificationService },
        {
          provide: NotificationRequestDetailService,
          useValue: mockNotificationRequestDetailService,
        },
        { provide: getRepositoryToken(NotifyConfiguration), useValue: mockConfigurationRepository },
        { provide: QueueName.INGESTION, useValue: mockIngestionQueue },
      ],
    }).compile()

    service = module.get<GcNotifyInternalExecutionService>(GcNotifyInternalExecutionService)
  })

  describe('sendEmail', () => {
    const body = {
      email_address: 'user@example.com',
      template_id: 'tpl-1',
      personalisation: { name: 'Alice' },
      reference: 'ref-1',
    }

    it('throws a GC Notify-shaped error when the template is not found locally', async () => {
      mockTemplatesRepository.findById.mockResolvedValue(null)

      await expect(service.sendEmail(body, TENANT_ID)).rejects.toMatchObject({
        response: { errors: [{ error: 'ValidationError', message: 'Template not found' }] },
      })
      expect(mockTemplatesRepository.findById).toHaveBeenCalledWith(TENANT_ID, 'tpl-1')
    })

    it('throws when the template exists but is for the wrong channel', async () => {
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'tpl-1',
        channelCode: NotificationChannel.SMS,
      })

      await expect(service.sendEmail(body, TENANT_ID)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('renders the template, creates a notification record, and returns a GC Notify-shaped response', async () => {
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'tpl-1',
        version: 3,
        channelCode: NotificationChannel.EMAIL,
      })
      mockTemplatesService.renderTemplateContent.mockResolvedValue({
        subject: 'Hello Alice',
        body: 'Welcome Alice',
        bodyType: 'html',
      })
      mockNotificationService.create.mockResolvedValue({
        id: 'notif-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })

      const result = await service.sendEmail(body, TENANT_ID)

      expect(result).toEqual({
        id: 'notif-1',
        reference: 'ref-1',
        content: {
          subject: 'Hello Alice',
          body: 'Welcome Alice',
          from_email: 'not-configured@example.com',
        },
        uri: '/gcnotify/v2/notifications/notif-1',
        template: { id: 'tpl-1', version: 3, uri: '/gcnotify/v2/template/tpl-1' },
        scheduled_for: undefined,
      })

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID, status: 'pending' }),
      )
      expect(mockNotificationRequestDetailService.createPending).toHaveBeenCalled()

      await flushMicrotasks()
      expect(mockIngestionQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ notifyId: 'notif-1', tenantId: TENANT_ID }),
        expect.objectContaining({ jobId: 'notif-1' }),
      )
      expect(mockNotificationService.update).toHaveBeenCalledWith(
        'notif-1',
        TENANT_ID,
        expect.objectContaining({ status: 'queued' }),
      )
    })
  })

  describe('sendSms', () => {
    const body = {
      phone_number: '+15555550100',
      template_id: 'tpl-2',
      personalisation: { code: '123456' },
    }

    it('throws a GC Notify-shaped error when the template is not found locally', async () => {
      mockTemplatesRepository.findById.mockResolvedValue(null)

      await expect(service.sendSms(body, TENANT_ID)).rejects.toMatchObject({
        response: { errors: [{ error: 'ValidationError', message: 'Template not found' }] },
      })
    })

    it('renders the template and returns a GC Notify-shaped SMS response', async () => {
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'tpl-2',
        version: 1,
        channelCode: NotificationChannel.SMS,
      })
      mockTemplatesService.renderTemplateContent.mockResolvedValue({
        body: 'Your code is 123456',
        bodyType: 'text',
      })
      mockNotificationService.create.mockResolvedValue({
        id: 'notif-2',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })

      const result = await service.sendSms(body, TENANT_ID)

      expect(result).toEqual({
        id: 'notif-2',
        reference: undefined,
        content: { body: 'Your code is 123456', from_number: 'not-configured@example.com' },
        uri: '/gcnotify/v2/notifications/notif-2',
        template: { id: 'tpl-2', version: 1, uri: '/gcnotify/v2/template/tpl-2' },
        scheduled_for: undefined,
      })
    })
  })

  describe('getNotificationById', () => {
    it('maps a notification entity to the GC Notify Notification shape', async () => {
      mockNotificationService.findOne.mockResolvedValue({
        id: 'notif-3',
        tenantId: TENANT_ID,
        status: 'completed',
        channelCode: NotificationChannel.EMAIL,
        recipients: { email: ['user@example.com'] },
        payload: { templateId: 'tpl-1', params: { name: 'Alice' }, reference: 'ref-3' },
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'tpl-1',
        version: 2,
        channelCode: NotificationChannel.EMAIL,
      })
      mockTemplatesService.renderTemplateContent.mockResolvedValue({
        subject: 'Hello Alice',
        body: 'Welcome Alice',
        bodyType: 'html',
      })

      const result = await service.getNotificationById('notif-3', TENANT_ID)

      expect(result).toMatchObject({
        id: 'notif-3',
        reference: 'ref-3',
        email_address: 'user@example.com',
        type: 'email',
        status: 'delivered',
        body: 'Welcome Alice',
        subject: 'Hello Alice',
        template: { id: 'tpl-1', version: 2, uri: '/gcnotify/v2/template/tpl-1' },
      })
    })
  })

  describe('getTemplate', () => {
    it('maps a TemplateResponseDto to the GC Notify Template shape', async () => {
      mockTemplatesService.getTemplate.mockResolvedValue({
        id: 'tpl-1',
        name: 'Welcome Email',
        description: 'desc',
        channelCode: NotificationChannel.EMAIL,
        subject: 'Hi {{name}}',
        body: 'Welcome {{name}}',
        active: true,
        createdBy: 'user-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      })

      const result = await service.getTemplate('tpl-1', TENANT_ID)

      expect(result).toEqual({
        id: 'tpl-1',
        name: 'Welcome Email',
        description: 'desc',
        type: 'email',
        subject: 'Hi {{name}}',
        body: 'Welcome {{name}}',
        active: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
        created_by: 'user-1',
      })
    })
  })
})
