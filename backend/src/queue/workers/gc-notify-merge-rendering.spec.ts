import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Logger } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import type { Job } from 'bullmq'
import { EmailDeliveryWorker } from './email-delivery.worker'
import { MergeBatchRunner } from './merge-batch-runner'
import { SMS_CHANNEL } from './delivery-channel'
import { ingestionJobFromRequest, mergeContentFromRequest } from '../merge-batch-builder'
import type { DeliveryJobPayload } from '../queue.types'
import { TemplatesService } from '../../api/templates/templates.service'
import { EmailTemplateLayoutService } from '../../api/templates/email-template-layout.service'
import { SmsSegmentService } from '../../api/notify/services/sms-segment.service'
import { NotifyContent, NotifySmsContent } from '../../api/notify/schemas/notify-content'
import { LegacyGcNotifyTemplateRenderer } from '../../services/rendering/engines/legacy-gc-notify-template.renderer'
import { GcNotifyNativeTemplateRenderer } from '../../services/rendering/engines/gc-notify-native-template.renderer'
import {
  encodeGcNotifyBlock,
  toGcNotifyDeliverySubject,
  toGcNotifyEmailHtml,
} from '../../services/rendering/gc-notify-markdown'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { TemplateEngine } from '../../enum/template-engine.enum'

/**
 * A GC Notify bulk send through the real renderers, layout, merge runner and email worker. Only
 * the adapter and the database are stubbed, because the point is the email that comes out.
 */
const SUBJECT = `Q&A session - it's "fine"`
const BODY = [
  '# Main heading',
  '',
  'Hello ((first_name)),',
  'This second line should stay on its own line.',
  '',
  '((vip??VIP section.))',
  '',
  '^ A quote.',
  '',
  '> A literal greater-than sign.',
  '',
  '• Dot bullet one',
  '• Dot bullet two',
  '',
  'Dash test - with spaces.',
  '',
  '| Table | Test |',
  '|---|---|',
  '| should | vanish |',
  '',
  'Text after the table.',
].join('\n')

const renderers: Record<string, unknown> = {
  legacy_gc_notify: new LegacyGcNotifyTemplateRenderer(),
  gc_notify_native: new GcNotifyNativeTemplateRenderer(),
}
const layout = new EmailTemplateLayoutService(
  {
    findByTenantId: async () => ({ emailLogoId: 'logo', useCustomEmailHeader: false }),
  } as never,
  {
    findByIdIfApproved: async () => ({ displayTitle: '' }),
    buildEmailImageUrl: () => 'https://example.com/logo',
    getDefault: async () => ({ id: 'logo' }),
  } as never,
)
const templatesService = Object.assign(Object.create(TemplatesService.prototype), {
  rendererRegistry: { getRenderer: (name: string) => renderers[name] },
  emailTemplateLayoutService: layout,
}) as TemplatesService

const storedTemplate = (template: Record<string, unknown> = {}) =>
  ({
    id: 'tpl-1',
    name: 'Test',
    tenantId: 'tenant-1',
    channelCode: 'EMAIL',
    engineCode: TemplateEngine.LEGACY_GC_NOTIFY,
    subject: SUBJECT,
    body: BODY,
    ...template,
  }) as never

describe('GC Notify merge rendering', () => {
  const templatesRepository = { findById: vi.fn() }
  const emailAdapter = { name: 'test', send: vi.fn() }
  const requestDetailService = {
    findBatchRecipients: vi.fn(),
    markRecipientSent: vi.fn(),
    markRecipientFailed: vi.fn(),
    countByStatuses: vi.fn(),
  }
  const notificationService = { update: vi.fn() }
  const runner = new MergeBatchRunner(
    notificationService as never,
    requestDetailService as never,
    templatesRepository as never,
  )
  const worker = new EmailDeliveryWorker(
    notificationService as never,
    requestDetailService as never,
    templatesRepository as never,
    templatesService,
    {} as never,
    {} as never,
    emailAdapter as never,
    runner,
    {} as never,
  )

  const mergeJob = (content: Record<string, unknown>, channel = NotificationChannel.EMAIL) =>
    ({
      id: 'notify-1-0',
      data: {
        notifyId: 'notify-1',
        tenantId: 'tenant-1',
        channel,
        mailMerge: true,
        batchId: 'notify-1-0',
        mailMergeData: { content, params: {} },
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    }) as unknown as Job<DeliveryJobPayload>

  /** Runs one merge batch and returns the single email handed to the adapter. */
  async function deliverMerge(params: Record<string, unknown>, gcNotifyRendering = true) {
    requestDetailService.findBatchRecipients.mockResolvedValue([
      { address: 'a@example.com', params, status: 'pending' },
    ])
    const job = mergeJob({ templateId: 'tpl-1', ...(gcNotifyRendering && { gcNotifyRendering }) })
    const sender = await (worker as any).mergeSender(job)
    const result = await runner.run(job, sender)
    expect(result).toMatchObject({ sent: 1, failed: 0 })
    return emailAdapter.send.mock.calls[0][0].content
  }

  /** What a GC Notify single send delivers: rendered as sendEmail does, branded as the worker does. */
  async function deliverSingle(params: Record<string, unknown>) {
    const rendered = await templatesService.renderTemplateContent(
      storedTemplate({ engineCode: TemplateEngine.GC_NOTIFY_NATIVE }),
      params,
    )
    return layout.apply(
      { tenantId: 'tenant-1', channelCode: 'EMAIL' },
      {
        subject: toGcNotifyDeliverySubject(rendered.subject ?? ''),
        body: toGcNotifyEmailHtml(rendered.body),
        bodyType: 'html',
      },
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {})
    templatesRepository.findById.mockResolvedValue(storedTemplate())
    requestDetailService.countByStatuses.mockResolvedValue({ sent: 1 })
    emailAdapter.send.mockResolvedValue({ messageId: 'msg-1' })
  })

  describe('with the marker', () => {
    const params = { first_name: 'Test', vip: 'n' }

    it('delivers exactly what a GC Notify single send delivers', async () => {
      const merge = await deliverMerge(params)
      const single = await deliverSingle(params)

      expect(merge.subject).toBe(single.subject)
      expect(merge.body).toBe(single.body)
      expect(merge.bodyType).toBe('html')
    })

    it("applies GC Notify's dialect rather than CommonMark", async () => {
      const { subject, body } = await deliverMerge(params)

      expect(subject).toBe('Q&A session – it’s “fine”')
      expect(body).toContain('<h2 style=')
      expect(body).toContain('Hello Test,<br>')
      expect(body).toContain('<blockquote>')
      expect(body).toContain('&gt; A literal greater-than sign.')
      expect(body).toContain('<li>Dot bullet one</li>')
      expect(body).toContain('Dash test – with spaces.')
      expect(body).not.toContain('vanish')
      expect(body).toContain('Text after the table.')
    })

    it.each(['n', 'non', 'on', 'maybe'])('hides a conditional whose value is %s', async (vip) => {
      const { body } = await deliverMerge({ first_name: 'Test', vip })

      expect(body).not.toContain('VIP section')
    })

    it.each(['yes', 'oui', 'TRUE', '1'])('shows a conditional whose value is %s', async (vip) => {
      const { body } = await deliverMerge({ first_name: 'Test', vip })

      expect(body).toContain('VIP section')
    })

    it('renders a multi-line conditional as a block, not as marker text', async () => {
      templatesRepository.findById.mockResolvedValue(
        storedTemplate({ body: 'Before\n\n((c??Line one\n* bullet a\n* bullet b))\n\nAfter' }),
      )

      const { body } = await deliverMerge({ c: 'yes' })

      expect(body).toContain('<li>bullet a</li>')
      expect(body).not.toContain('GCNOTIFYBLOCK')
    })

    it('does not decode a block marker supplied as a personalisation value', async () => {
      const smuggled = encodeGcNotifyBlock('<script>alert(1)</script>').trim()

      const { body } = await deliverMerge({ first_name: smuggled, vip: 'n' })

      expect(body).not.toContain('<script>')
      expect(body).not.toContain('GCNOTIFYBLOCK')
    })

    it('renders SMS merge recipients with the GC Notify engine too', async () => {
      templatesRepository.findById.mockResolvedValue(storedTemplate({ channelCode: 'SMS' }))
      requestDetailService.findBatchRecipients.mockResolvedValue([
        { address: '+12505551234', params: {}, status: 'pending' },
      ])
      const send = vi.fn().mockResolvedValue('msg-1')

      await runner.run(
        mergeJob({ templateId: 'tpl-1', gcNotifyRendering: true }, NotificationChannel.SMS),
        { channel: SMS_CHANNEL, hasInlineContent: () => false, send },
      )

      expect(send.mock.calls[0][2].template.engineCode).toBe(TemplateEngine.GC_NOTIFY_NATIVE)
    })

    it('bills SMS segments for the body actually sent', async () => {
      // A conditional long enough to be a second segment, hidden by "n" only under GC Notify's rules.
      const smsTemplate = storedTemplate({
        channelCode: 'SMS',
        body: `Hello((vip??${' extra words'.repeat(30)}))`,
      })
      templatesRepository.findById.mockResolvedValue(smsTemplate)
      const segments = new SmsSegmentService(
        templatesRepository as never,
        templatesService,
        {} as never,
      )
      const request = (content: Record<string, unknown>) =>
        ({ sms: { content: { templateId: 'tpl-1', ...content } } }) as never

      const marked = await segments.countMergeSegments(
        'tenant-1',
        request({ gcNotifyRendering: true }),
        [{ vip: 'n' }],
      )
      const unmarked = await segments.countMergeSegments('tenant-1', request({}), [{ vip: 'n' }])

      expect(marked).toBe(1)
      expect(unmarked).toBeGreaterThan(1)
    })
  })

  describe('without the marker', () => {
    it('leaves an ordinary merge on the stored engine and CommonMark', async () => {
      const { subject, body } = await deliverMerge({ first_name: 'Test', vip: 'n' }, false)

      expect(subject).toBe(SUBJECT)
      expect(body).toContain('<h1>Main heading</h1>')
      expect(body).toContain('^ A quote.')
      // The legacy engine's own truthiness, which ordinary API callers may rely on.
      expect(body).toContain('VIP section')
    })

    it('does not use the GC Notify engine for an SMS merge', async () => {
      templatesRepository.findById.mockResolvedValue(storedTemplate({ channelCode: 'SMS' }))
      requestDetailService.findBatchRecipients.mockResolvedValue([
        { address: '+12505551234', params: {}, status: 'pending' },
      ])
      const send = vi.fn().mockResolvedValue('msg-1')

      await runner.run(mergeJob({ templateId: 'tpl-1' }, NotificationChannel.SMS), {
        channel: SMS_CHANNEL,
        hasInlineContent: () => false,
        send,
      })

      expect(send.mock.calls[0][2].template.engineCode).toBe(TemplateEngine.LEGACY_GC_NOTIFY)
    })
  })

  describe('the marker', () => {
    const payload = {
      email: {
        recipients: { mergeArray: [['to'], ['a@example.com']] },
        content: { templateId: 'tpl-1', gcNotifyRendering: true },
      },
    }

    it('survives a job rebuilt from the stored request', () => {
      expect(mergeContentFromRequest(payload, NotificationChannel.EMAIL).content).toMatchObject({
        gcNotifyRendering: true,
      })

      const rebuilt = ingestionJobFromRequest({
        id: 'notify-1',
        tenantId: 'tenant-1',
        payload,
        createdAt: new Date(),
      })
      expect(rebuilt.mailMergeData?.content).toMatchObject({ gcNotifyRendering: true })
    })

    it.each([
      ['email', NotifyContent],
      ['sms', NotifySmsContent],
    ])('cannot be set by a public %s API caller', async (_name, contentClass) => {
      const content = plainToInstance(contentClass as never, {
        templateId: '12345678-1234-4234-8234-123456789012',
        gcNotifyRendering: true,
      })

      const errors = await validate(content as object, {
        whitelist: true,
        forbidNonWhitelisted: true,
      })

      expect(errors.map(({ property }) => property)).toContain('gcNotifyRendering')
    })
  })
})
