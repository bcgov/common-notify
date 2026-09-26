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
import { GcNotifyBulkValidationService } from './gc-notify-bulk-validation.service'
import { ApiKeyUsageService } from '../api-keys/api-key-usage.service'
import { SmsSegmentService } from '../notify/services/sms-segment.service'
import { NotificationDedupService } from '../notify/services/notification-dedup.service'
import {
  enforceLimits,
  handleMerge,
  recordAcceptedUsage,
  resolveSmsSegments,
} from '../../common/decorators/queueable.decorator'

vi.mock('../../common/decorators/queueable.decorator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../common/decorators/queueable.decorator')>()),
  handleMerge: vi.fn(),
  enforceLimits: vi.fn(),
  recordAcceptedUsage: vi.fn(),
  resolveSmsSegments: vi.fn(),
}))
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service'
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
  const mockBulkValidationService = { validateRows: vi.fn() }
  const mockApiKeyUsageService = { assertWithinLimits: vi.fn(), recordUsage: vi.fn() }
  const mockSmsSegmentService = { countSegments: vi.fn() }
  let mockTenantSettingsService: { resolveSenderAddress: ReturnType<typeof vi.fn> }
  // Disabled unless a test opts in, so the rest of the suite runs the undeduplicated path.
  let mockNotificationDedupService: {
    enabled: boolean
    fingerprint: ReturnType<typeof vi.fn>
    findDuplicate: ReturnType<typeof vi.fn>
    claim: ReturnType<typeof vi.fn>
  }

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
    mockBulkValidationService.validateRows.mockReturnValue({ valid: true, errors: [] })
    // vi.clearAllMocks() does not reach a module mock, so these are reset explicitly - otherwise a
    // mockRejectedValue set in one test leaks into every test that runs after it.
    for (const fn of [handleMerge, enforceLimits, recordAcceptedUsage, resolveSmsSegments]) {
      vi.mocked(fn).mockReset()
    }
    vi.mocked(resolveSmsSegments).mockResolvedValue(1)
    // The response reports the address delivery will send from, resolved for this tenant.
    mockTenantSettingsService = {
      resolveSenderAddress: vi.fn().mockResolvedValue('permits@gov.bc.ca'),
    }
    mockNotificationDedupService = {
      enabled: false,
      fingerprint: vi.fn().mockReturnValue('fingerprint-1'),
      findDuplicate: vi.fn().mockResolvedValue(null),
      claim: vi.fn(),
    }

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
        { provide: GcNotifyBulkValidationService, useValue: mockBulkValidationService },
        { provide: ApiKeyUsageService, useValue: mockApiKeyUsageService },
        { provide: SmsSegmentService, useValue: mockSmsSegmentService },
        { provide: TenantSettingsService, useValue: mockTenantSettingsService },
        { provide: getRepositoryToken(NotifyConfiguration), useValue: mockConfigurationRepository },
        { provide: QueueName.INGESTION, useValue: mockIngestionQueue },
        { provide: AttachmentValidationService, useValue: mockAttachmentValidationService },
        { provide: AttachmentProcessingService, useValue: mockAttachmentProcessingService },
        { provide: NotificationDedupService, useValue: mockNotificationDedupService },
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
          from_email: 'permits@gov.bc.ca',
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
        expect.objectContaining({ id: 'tpl-1', engineCode: TemplateEngine.GC_NOTIFY_NATIVE }),
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

    it('hands delivery GC Notify-rendered HTML rather than markdown for the CHES adapter', async () => {
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
      const content = jobPayload.request.email.content

      // GC Notify renders `#` as an h2, so this also pins the dialect, not just the conversion.
      expect(content.bodyType).toBe('html')
      expect(content.body).toContain('<h2')
      expect(content.body).toContain('<strong>Bold</strong>')
      expect(content.body).not.toContain('# Heading')
    })

    it('reports the tenant sender delivery will use, not a separate configured value', async () => {
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'tpl-1',
        version: 3,
        channelCode: NotificationChannel.EMAIL,
      })
      mockTemplatesService.renderTemplateContent.mockResolvedValue({
        subject: 's',
        body: 'b',
        bodyType: 'markdown',
      })
      mockNotificationService.create.mockResolvedValue({
        id: 'notif-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })
      mockTenantSettingsService.resolveSenderAddress.mockResolvedValue('alerts@gov.bc.ca')

      const result = await service.sendEmail(body, TENANT_ID)

      expect(mockTenantSettingsService.resolveSenderAddress).toHaveBeenCalledWith(TENANT_ID)
      expect(result.content.from_email).toBe('alerts@gov.bc.ca')
    })

    it('forwards a list personalisation value to the renderer', async () => {
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'tpl-1',
        version: 3,
        channelCode: NotificationChannel.EMAIL,
      })
      mockTemplatesService.renderTemplateContent.mockResolvedValue({
        subject: 'Your order',
        body: 'Your order contains:\n\n* apples\n* pears',
        bodyType: 'markdown',
      })
      mockNotificationService.create.mockResolvedValue({
        id: 'notif-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })

      // A list value is a template variable, not an attachment: dropping it left the renderer
      // with no value for ((items)), which fails validation as a missing placeholder.
      await service.sendEmail(
        {
          email_address: 'user@example.com',
          template_id: 'tpl-1',
          personalisation: { first_name: 'Amala', items: ['apples', 'pears'] },
        },
        TENANT_ID,
      )

      expect(mockTemplatesService.renderTemplateContent).toHaveBeenCalledWith(expect.anything(), {
        first_name: 'Amala',
        items: ['apples', 'pears'],
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

  describe('usage counting on single sends', () => {
    beforeEach(() => {
      vi.mocked(enforceLimits).mockClear()
      vi.mocked(recordAcceptedUsage).mockClear()
      vi.mocked(resolveSmsSegments).mockClear()
      vi.mocked(resolveSmsSegments).mockResolvedValue(1)
      mockNotificationService.create.mockResolvedValue({
        id: 'notif-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })
    })

    it('counts an email send as one message against the calling key', async () => {
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'tpl-1',
        version: 3,
        channelCode: NotificationChannel.EMAIL,
      })
      mockTemplatesService.renderTemplateContent.mockResolvedValue({
        subject: 's',
        body: 'b',
        bodyType: 'markdown',
      })

      await service.sendEmail(
        { email_address: 'user@example.com', template_id: 'tpl-1' },
        TENANT_ID,
        'consumer-7',
      )

      expect(enforceLimits).toHaveBeenCalledWith(expect.anything(), 'consumer-7', [
        { channel: NotificationChannel.EMAIL, count: 1 },
      ])
      expect(recordAcceptedUsage).toHaveBeenCalledWith(expect.anything(), 'consumer-7', [
        { channel: NotificationChannel.EMAIL, count: 1 },
      ])
    })

    it('counts an SMS send in billable segments, not messages', async () => {
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'tpl-2',
        version: 1,
        channelCode: NotificationChannel.SMS,
      })
      mockTemplatesService.renderTemplateContent.mockResolvedValue({
        body: 'a'.repeat(400),
        bodyType: 'text',
      })
      vi.mocked(resolveSmsSegments).mockResolvedValue(3)

      await service.sendSms(
        { phone_number: '+15555550100', template_id: 'tpl-2' },
        TENANT_ID,
        'consumer-7',
      )

      expect(enforceLimits).toHaveBeenCalledWith(expect.anything(), 'consumer-7', [
        { channel: NotificationChannel.SMS, count: 3 },
      ])
      expect(recordAcceptedUsage).toHaveBeenCalledWith(expect.anything(), 'consumer-7', [
        { channel: NotificationChannel.SMS, count: 3 },
      ])
    })

    it('rejects before enqueueing when the key is over its limit', async () => {
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'tpl-1',
        version: 3,
        channelCode: NotificationChannel.EMAIL,
      })
      mockTemplatesService.renderTemplateContent.mockResolvedValue({
        subject: 's',
        body: 'b',
        bodyType: 'markdown',
      })
      vi.mocked(enforceLimits).mockRejectedValueOnce(new Error('over limit'))

      await expect(
        service.sendEmail(
          { email_address: 'user@example.com', template_id: 'tpl-1' },
          TENANT_ID,
          'consumer-7',
        ),
      ).rejects.toThrow('over limit')

      expect(mockNotificationService.create).not.toHaveBeenCalled()
      expect(recordAcceptedUsage).not.toHaveBeenCalled()
    })
  })

  describe('deduplication', () => {
    const CLAIMED_ID = '0b7c6f1e-2d4a-4c8e-9f10-3a5b7c9d1e2f'
    const ORIGINAL_ID = '6f1e0b7c-4a2d-4e8c-8f10-9d1e2f3a5b7c'
    const original = {
      notifyId: ORIGINAL_ID,
      status: 'completed',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }
    const release = vi.fn().mockResolvedValue(undefined)
    const emailBody = {
      email_address: 'user@example.com',
      template_id: 'tpl-1',
      personalisation: { name: 'Alice' },
    }
    const smsBody = { phone_number: '+15555550100', template_id: 'tpl-2' }

    beforeEach(() => {
      vi.mocked(enforceLimits).mockClear()
      vi.mocked(recordAcceptedUsage).mockClear()
      vi.mocked(resolveSmsSegments).mockClear()
      vi.mocked(resolveSmsSegments).mockResolvedValue(1)
      mockNotificationDedupService.enabled = true
      mockNotificationDedupService.claim.mockResolvedValue({
        kind: 'proceed',
        notifyId: CLAIMED_ID,
        release,
      })
      mockNotificationService.create.mockImplementation(async (dto: { id?: string }) => ({
        id: dto.id ?? 'db-generated-id',
        createdAt: new Date(),
      }))
      mockTemplatesService.renderTemplateContent.mockResolvedValue({
        subject: 's',
        body: 'b',
        bodyType: 'markdown',
      })
    })

    const emailTemplate = () =>
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'tpl-1',
        version: 3,
        channelCode: NotificationChannel.EMAIL,
      })
    const smsTemplate = () =>
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'tpl-2',
        version: 1,
        channelCode: NotificationChannel.SMS,
      })

    it('fingerprints the recipient where recipients are normalised, and the template version', async () => {
      emailTemplate()

      await service.sendEmail(emailBody, TENANT_ID, 'consumer-7')

      expect(mockNotificationDedupService.fingerprint).toHaveBeenCalledWith({
        email: { recipients: { to: ['user@example.com'] } },
        gcNotify: expect.objectContaining({
          template_id: 'tpl-1',
          personalisation: { name: 'Alice' },
          email_address: undefined,
          templateVersion: 3,
        }),
      })
    })

    it('creates the row with the claimed notifyId and returns it', async () => {
      emailTemplate()

      const result = await service.sendEmail(emailBody, TENANT_ID, 'consumer-7')

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: CLAIMED_ID }),
      )
      expect(result.id).toBe(CLAIMED_ID)
      expect(result.uri).toBe(`/gcnotify/v2/notifications/${CLAIMED_ID}`)
    })

    it('answers a known duplicate with the original id, storing and counting nothing', async () => {
      emailTemplate()
      mockNotificationDedupService.findDuplicate.mockResolvedValue(original)

      const result = await service.sendEmail(
        {
          ...emailBody,
          personalisation: { name: 'Alice', doc: { file: 'aGVsbG8=', filename: 'a.pdf' } },
        },
        TENANT_ID,
        'consumer-7',
      )

      expect(result.id).toBe(ORIGINAL_ID)
      expect(result.uri).toBe(`/gcnotify/v2/notifications/${ORIGINAL_ID}`)
      expect(mockAttachmentProcessingService.processAttachments).not.toHaveBeenCalled()
      expect(enforceLimits).not.toHaveBeenCalled()
      expect(mockNotificationService.create).not.toHaveBeenCalled()
      expect(recordAcceptedUsage).not.toHaveBeenCalled()
    })

    it('does not create or count a send that loses the claim race', async () => {
      emailTemplate()
      mockNotificationDedupService.claim.mockResolvedValue({ kind: 'duplicate', original })

      const result = await service.sendEmail(emailBody, TENANT_ID, 'consumer-7')

      expect(result.id).toBe(ORIGINAL_ID)
      expect(mockNotificationService.create).not.toHaveBeenCalled()
      expect(recordAcceptedUsage).not.toHaveBeenCalled()
      expect(mockIngestionQueue.add).not.toHaveBeenCalled()
    })

    it('releases the claim when the row cannot be created', async () => {
      emailTemplate()
      mockNotificationService.create.mockRejectedValueOnce(new Error('database down'))

      await expect(service.sendEmail(emailBody, TENANT_ID, 'consumer-7')).rejects.toThrow(
        'database down',
      )
      expect(release).toHaveBeenCalledTimes(1)
    })

    it('answers a duplicate SMS without counting its segments', async () => {
      smsTemplate()
      mockNotificationDedupService.findDuplicate.mockResolvedValue(original)

      const result = await service.sendSms(smsBody, TENANT_ID, 'consumer-7')

      expect(result.id).toBe(ORIGINAL_ID)
      expect(mockNotificationDedupService.fingerprint).toHaveBeenCalledWith({
        sms: { recipients: { to: ['+15555550100'] } },
        gcNotify: expect.objectContaining({ template_id: 'tpl-2', phone_number: undefined }),
      })
      expect(resolveSmsSegments).not.toHaveBeenCalled()
      expect(mockNotificationService.create).not.toHaveBeenCalled()
    })

    it('reports the row count for a duplicate bulk send, which carries no count of its own', async () => {
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'tpl-bulk',
        version: 2,
        channelCode: NotificationChannel.EMAIL,
      })
      vi.mocked(handleMerge).mockResolvedValue({
        notifyId: ORIGINAL_ID,
        duplicate: true,
        createdAt: original.createdAt,
      } as never)

      const result = await service.sendBulk(
        {
          template_id: 'tpl-bulk',
          name: 'Reminders',
          rows: [['email address'], ['alice@example.com'], ['bob@example.com']],
        } as any,
        TENANT_ID,
      )

      expect(result.data).toMatchObject({ id: ORIGINAL_ID, notification_count: 2 })
    })
  })

  describe('sendBulk', () => {
    const TEMPLATE = {
      id: 'tpl-bulk',
      version: 2,
      channelCode: NotificationChannel.EMAIL,
    }

    const accepted = {
      notifyId: 'notif-bulk-1',
      recipientCount: 2,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }

    const bulkBody = {
      template_id: 'tpl-bulk',
      name: 'January Reminders',
      rows: [
        ['email address', 'first_name'],
        ['alice@example.com', 'Alice'],
        ['bob@example.com', 'Bob'],
      ],
    } as any

    beforeEach(() => {
      // vi.clearAllMocks() in the outer hook does not reach a module mock, so calls would
      // otherwise accumulate across these tests and calls[0] would be a stale one.
      vi.mocked(handleMerge).mockClear()
      mockTemplatesRepository.findById.mockResolvedValue(TEMPLATE)
      vi.mocked(handleMerge).mockResolvedValue(accepted as never)
    })

    it('renames the GC Notify recipient column to the "to" column the merge pipeline requires', async () => {
      await service.sendBulk(bulkBody, TENANT_ID)

      const dto = vi.mocked(handleMerge).mock.calls[0][4] as any
      expect(dto.email.recipients.mergeArray).toEqual([
        ['to', 'first_name'],
        ['alice@example.com', 'Alice'],
        ['bob@example.com', 'Bob'],
      ])
      expect(dto.email.content).toEqual({ templateId: 'tpl-bulk' })
    })

    it('returns a GC Notify job shape, omitting fields we have no honest value for', async () => {
      const result = await service.sendBulk(bulkBody, TENANT_ID)

      expect(result.data).toMatchObject({
        id: 'notif-bulk-1',
        template: 'tpl-bulk',
        job_status: 'pending',
        notification_count: 2,
        original_file_name: 'January Reminders',
        template_version: 2,
        template_type: 'email',
        created_at: '2026-01-01T00:00:00.000Z',
      })
      // GC Notify fills these from its own user and key model; inventing them would misreport.
      expect(result.data).not.toHaveProperty('created_by')
      expect(result.data).not.toHaveProperty('api_key')
      expect(result.data).not.toHaveProperty('service_name')
      expect(result.data).not.toHaveProperty('sender_id')
    })

    it('sends through the SMS channel when the template is an SMS template', async () => {
      mockTemplatesRepository.findById.mockResolvedValue({
        ...TEMPLATE,
        channelCode: NotificationChannel.SMS,
      })

      await service.sendBulk(
        {
          ...bulkBody,
          rows: [
            ['phone number', 'first_name'],
            ['+12505551234', 'Alice'],
          ],
        } as any,
        TENANT_ID,
      )

      const dto = vi.mocked(handleMerge).mock.calls[0][4] as any
      const channel = vi.mocked(handleMerge).mock.calls[0][7]
      expect(channel).toBe(NotificationChannel.SMS)
      expect(dto.sms.recipients.mergeArray[0]).toEqual(['to', 'first_name'])
    })

    it('parses a csv body into rows', async () => {
      await service.sendBulk(
        {
          template_id: 'tpl-bulk',
          name: 'From CSV',
          csv: 'email address,first_name\nalice@example.com,Alice\nbob@example.com,Bob\n',
        } as any,
        TENANT_ID,
      )

      const dto = vi.mocked(handleMerge).mock.calls[0][4] as any
      // The trailing newline must not become a recipient with no address.
      expect(dto.email.recipients.mergeArray).toEqual([
        ['to', 'first_name'],
        ['alice@example.com', 'Alice'],
        ['bob@example.com', 'Bob'],
      ])
    })

    it('rejects a csv holding only a header row', async () => {
      await expect(
        service.sendBulk(
          { template_id: 'tpl-bulk', name: 'x', csv: 'email address,first_name\n' } as any,
          TENANT_ID,
        ),
      ).rejects.toMatchObject({ status: 400 })
      expect(handleMerge).not.toHaveBeenCalled()
    })

    it('rejects a header with no recipient column', async () => {
      await expect(
        service.sendBulk(
          {
            template_id: 'tpl-bulk',
            name: 'x',
            rows: [['first_name'], ['Alice']],
          } as any,
          TENANT_ID,
        ),
      ).rejects.toMatchObject({ status: 400 })
      expect(handleMerge).not.toHaveBeenCalled()
    })

    it('rejects invalid rows atomically with 422 and never enqueues', async () => {
      const messages = ['Row 1: "12345" is not a valid E.164 phone number']
      mockBulkValidationService.validateRows.mockReturnValue({ valid: false, errors: messages })

      await expect(service.sendBulk(bulkBody, TENANT_ID)).rejects.toMatchObject({
        status: 422,
        response: { errors: messages.map((message) => ({ error: 'ValidationError', message })) },
      })
      expect(handleMerge).not.toHaveBeenCalled()
    })

    it('counts the send against the calling API key, in billable segments for SMS', async () => {
      await service.sendBulk(bulkBody, TENANT_ID, 'consumer-9')

      const [ctx, , , , , apiKeyConsumerId] = vi.mocked(handleMerge).mock.calls[0]
      // Without the consumer the merge path records nothing, so this argument is the whole feature.
      expect(apiKeyConsumerId).toBe('consumer-9')
      // assertWithinLimits before accepting, recordUsage after; countSegments prices SMS.
      expect(ctx.apiKeyUsageService).toBe(mockApiKeyUsageService)
      expect(ctx.smsSegmentService).toBe(mockSmsSegmentService)
    })

    it('carries a scheduled send through to the merge and back into the job shape', async () => {
      const result = await service.sendBulk(
        { ...bulkBody, scheduled_for: '2026-06-25T15:15:00Z' } as any,
        TENANT_ID,
      )

      const dto = vi.mocked(handleMerge).mock.calls[0][4] as any
      expect(dto.email.delayedSend).toBe('2026-06-25T15:15:00Z')
      expect(result.data.scheduled_for).toBe('2026-06-25T15:15:00Z')
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
        expect.objectContaining({ id: 'tpl-2', engineCode: TemplateEngine.GC_NOTIFY_NATIVE }),
        body.personalisation,
      )
    })

    it('forwards a list personalisation value to the renderer', async () => {
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'tpl-2',
        version: 1,
        channelCode: NotificationChannel.SMS,
      })
      mockTemplatesService.renderTemplateContent.mockResolvedValue({
        body: 'Your order contains apples and pears',
        bodyType: 'text',
      })
      mockNotificationService.create.mockResolvedValue({
        id: 'notif-2',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })

      await service.sendSms(
        {
          phone_number: '+15555550100',
          template_id: 'tpl-2',
          personalisation: { items: ['apples', 'pears'] },
        },
        TENANT_ID,
      )

      expect(mockTemplatesService.renderTemplateContent).toHaveBeenCalledWith(expect.anything(), {
        items: ['apples', 'pears'],
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
      expect(mockTemplatesService.renderTemplateContent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tpl-1', engineCode: TemplateEngine.GC_NOTIFY_NATIVE }),
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
