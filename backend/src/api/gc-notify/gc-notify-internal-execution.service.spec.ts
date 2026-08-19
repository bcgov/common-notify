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
import { AttachmentValidationService } from '../notify/services/attachment-validation.service'
import { AttachmentProcessingService } from '../notify/services/attachment-processing.service'
import { SafelistService } from '../safelist/safelist.service'
import { QueueName } from '../../enum/queue-name.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { TemplateEngine } from '../../enum/template-engine.enum'

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
  let mockAttachmentValidationService: { validateAttachments: ReturnType<typeof vi.fn> }
  let mockAttachmentProcessingService: { processAttachments: ReturnType<typeof vi.fn> }
  let mockSafelistService: { findBlocked: ReturnType<typeof vi.fn> }

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
    mockAttachmentValidationService = { validateAttachments: vi.fn().mockResolvedValue(undefined) }
    mockAttachmentProcessingService = {
      // By default, echo back a single stored reference so callers can assert wiring.
      processAttachments: vi.fn().mockResolvedValue({
        email: { attachments: [{ attachmentId: 'att-1' }] },
      }),
    }
    // Nothing blocked by default: PROD does not enforce the safelist, and neither do the
    // existing expectations in this suite.
    mockSafelistService = { findBlocked: vi.fn().mockResolvedValue([]) }

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
        { provide: SafelistService, useValue: mockSafelistService },
        { provide: getRepositoryToken(NotifyConfiguration), useValue: mockConfigurationRepository },
        { provide: QueueName.INGESTION, useValue: mockIngestionQueue },
        { provide: AttachmentValidationService, useValue: mockAttachmentValidationService },
        { provide: AttachmentProcessingService, useValue: mockAttachmentProcessingService },
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
          from_email: 'not-configured@example.com',
          body: 'Welcome Alice',
          subject: 'Hello Alice',
        },
        uri: '/gcnotify/v2/notifications/notif-1',
        template: { id: 'tpl-1', version: 3, uri: '/gcnotify/v2/template/tpl-1' },
        scheduled_for: undefined,
      })

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID, status: 'pending' }),
      )
      expect(mockTemplatesService.renderTemplateContent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tpl-1', engineCode: TemplateEngine.LEGACY_GC_NOTIFY }),
        body.personalisation,
      )

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

    it('carries the rendered bodyType onto the enqueued email content so markdown is converted downstream', async () => {
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'tpl-1',
        version: 1,
        channelCode: NotificationChannel.EMAIL,
      })
      mockTemplatesService.renderTemplateContent.mockResolvedValue({
        subject: 'Subject',
        body: '# Heading\n\n**Bold**',
        bodyType: 'markdown',
      })
      mockNotificationService.create.mockResolvedValue({
        id: 'notif-md',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })

      await service.sendEmail(body, TENANT_ID)

      await flushMicrotasks()
      const [[jobPayload]] = mockIngestionQueue.add.mock.calls
      expect(jobPayload.request.email.content).toMatchObject({
        body: '# Heading\n\n**Bold**',
        bodyType: 'markdown',
      })
    })
  })

  describe('sendEmail attachments', () => {
    const emailTemplate = {
      id: 'tpl-1',
      version: 1,
      channelCode: NotificationChannel.EMAIL,
    }

    beforeEach(() => {
      mockTemplatesRepository.findById.mockResolvedValue(emailTemplate)
      mockTemplatesService.renderTemplateContent.mockResolvedValue({
        subject: 'Subject',
        body: 'Body',
        bodyType: 'html',
      })
      mockNotificationService.create.mockResolvedValue({
        id: 'notif-att',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })
    })

    it('does not touch the attachment pipeline when personalisation has no files', async () => {
      await service.sendEmail(
        { email_address: 'user@example.com', template_id: 'tpl-1', personalisation: { name: 'A' } },
        TENANT_ID,
      )

      expect(mockAttachmentValidationService.validateAttachments).not.toHaveBeenCalled()
      expect(mockAttachmentProcessingService.processAttachments).not.toHaveBeenCalled()

      await flushMicrotasks()
      const [[jobPayload]] = mockIngestionQueue.add.mock.calls
      expect(jobPayload.request.email.attachments).toBeUndefined()
    })

    it('lifts file personalisation out, stores it, and enqueues stored references', async () => {
      await service.sendEmail(
        {
          email_address: 'user@example.com',
          template_id: 'tpl-1',
          personalisation: {
            name: 'Alice',
            attachment1: {
              file: 'aGVsbG8=',
              filename: 'scratch.txt',
              sending_method: 'attach',
            },
          },
        },
        TENANT_ID,
      )

      // Only the string param reaches the renderer; the file entry is not rendered.
      expect(mockTemplatesService.renderTemplateContent).toHaveBeenCalledWith(expect.anything(), {
        name: 'Alice',
      })
      // GC Notify file object mapped to native NotifyAttachment (MIME derived from extension).
      expect(mockAttachmentProcessingService.processAttachments).toHaveBeenCalledWith(
        expect.objectContaining({
          email: {
            attachments: [{ filename: 'scratch.txt', mimeType: 'text/plain', content: 'aGVsbG8=' }],
          },
        }),
        TENANT_ID,
        TENANT_ID,
      )
      expect(mockAttachmentValidationService.validateAttachments).toHaveBeenCalledOnce()

      await flushMicrotasks()
      const [[jobPayload]] = mockIngestionQueue.add.mock.calls
      expect(jobPayload.request.email.attachments).toEqual([{ attachmentId: 'att-1' }])
    })

    it('rejects sending_method "link" with a 400', async () => {
      await expect(
        service.sendEmail(
          {
            email_address: 'user@example.com',
            template_id: 'tpl-1',
            personalisation: {
              doc: { file: 'aGVsbG8=', filename: 'a.pdf', sending_method: 'link' },
            },
          },
          TENANT_ID,
        ),
      ).rejects.toBeInstanceOf(BadRequestException)

      expect(mockAttachmentProcessingService.processAttachments).not.toHaveBeenCalled()
      expect(mockNotificationService.create).not.toHaveBeenCalled()
    })

    it('rejects a file whose extension is not in the allow-list with a 400', async () => {
      await expect(
        service.sendEmail(
          {
            email_address: 'user@example.com',
            template_id: 'tpl-1',
            personalisation: {
              danger: { file: 'aGVsbG8=', filename: 'malware.exe', sending_method: 'attach' },
            },
          },
          TENANT_ID,
        ),
      ).rejects.toBeInstanceOf(BadRequestException)

      expect(mockAttachmentProcessingService.processAttachments).not.toHaveBeenCalled()
      expect(mockNotificationService.create).not.toHaveBeenCalled()
    })
  })

  describe('recipient safelist enforcement', () => {
    it('rejects a GC Notify email send to a non-safelisted recipient without persisting it', async () => {
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'tpl-1',
        version: 1,
        channelCode: NotificationChannel.EMAIL,
      })
      mockTemplatesService.renderTemplateContent.mockResolvedValue({
        subject: 'Hi',
        body: 'Hello',
        bodyType: 'text',
      })
      mockSafelistService.findBlocked.mockResolvedValue(['user@example.com'])

      await expect(
        service.sendEmail({ email_address: 'user@example.com', template_id: 'tpl-1' }, TENANT_ID),
      ).rejects.toMatchObject({
        response: {
          errors: [
            {
              error: 'ValidationError',
              message: expect.stringContaining('user@example.com'),
            },
          ],
        },
      })

      expect(mockSafelistService.findBlocked).toHaveBeenCalledWith(TENANT_ID, [
        { address: 'user@example.com', channel: NotificationChannel.EMAIL },
      ])
      expect(mockNotificationService.create).not.toHaveBeenCalled()
      expect(mockIngestionQueue.add).not.toHaveBeenCalled()
    })

    it('checks the SMS recipient against the SMS safelist', async () => {
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'tpl-2',
        version: 1,
        channelCode: NotificationChannel.SMS,
      })
      mockTemplatesService.renderTemplateContent.mockResolvedValue({
        body: 'Your code is 123456',
        bodyType: 'text',
      })
      mockSafelistService.findBlocked.mockResolvedValue(['+15555550100'])

      await expect(
        service.sendSms({ phone_number: '+15555550100', template_id: 'tpl-2' }, TENANT_ID),
      ).rejects.toBeInstanceOf(BadRequestException)

      expect(mockSafelistService.findBlocked).toHaveBeenCalledWith(TENANT_ID, [
        { address: '+15555550100', channel: NotificationChannel.SMS },
      ])
      expect(mockNotificationService.create).not.toHaveBeenCalled()
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
      expect(mockTemplatesService.renderTemplateContent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tpl-2', engineCode: TemplateEngine.LEGACY_GC_NOTIFY }),
        body.personalisation,
      )
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
      expect(mockTemplatesService.renderTemplateContent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tpl-1', engineCode: TemplateEngine.LEGACY_GC_NOTIFY }),
        { name: 'Alice' },
      )
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
