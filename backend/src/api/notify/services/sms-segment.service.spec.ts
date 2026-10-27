import { vi } from 'vitest'
import { TemplatesRepository } from '../../templates/templates.repository'
import { TemplatesService } from '../../templates/templates.service'
import { InlineRenderingService } from '../../../services/rendering/inline-rendering.service'
import { SmsSegmentService } from './sms-segment.service'
import type { NotifySimpleRequest } from '../schemas/notify-simple-request'

describe('SmsSegmentService.countSegmentsPerRecipient', () => {
  const templatesRepository = { findById: vi.fn() }
  const templatesService = { renderTemplateContent: vi.fn() }
  const inlineRenderingService = { renderSms: vi.fn() }

  const service = new SmsSegmentService(
    templatesRepository as unknown as TemplatesRepository,
    templatesService as unknown as TemplatesService,
    inlineRenderingService as unknown as InlineRenderingService,
  )

  const request = (sms: Record<string, unknown>, params?: Record<string, unknown>) =>
    ({ sms, params }) as unknown as NotifySimpleRequest

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 0 when the request has no SMS channel', async () => {
    expect(await service.countSegmentsPerRecipient('tenant-1', {} as NotifySimpleRequest)).toBe(0)
  })

  it('counts segments of a literal body', async () => {
    const payload = request({ recipients: { to: ['+15551234567'] }, content: { body: 'short' } })
    expect(await service.countSegmentsPerRecipient('tenant-1', payload)).toBe(1)

    const long = request({
      recipients: { to: ['+15551234567'] },
      content: { body: 'a'.repeat(400) },
    })
    expect(await service.countSegmentsPerRecipient('tenant-1', long)).toBe(3)
  })

  it('renders a stored template and counts the rendered body, not the template source', async () => {
    templatesRepository.findById.mockResolvedValue({ id: 'tpl-1', channelCode: 'SMS' })
    templatesService.renderTemplateContent.mockResolvedValue({ body: 'a'.repeat(200) })

    const payload = request(
      { recipients: { to: ['+15551234567'] }, content: { templateId: 'tpl-1' }, params: { b: 2 } },
      { a: 1 },
    )

    // Short template source, long rendered output: two segments.
    expect(await service.countSegmentsPerRecipient('tenant-1', payload)).toBe(2)
    expect(templatesService.renderTemplateContent).toHaveBeenCalledWith(
      { id: 'tpl-1', channelCode: 'SMS' },
      { a: 1, b: 2 }, // channel params merged over request params, as the delivery worker does
    )
  })

  it('renders inline content when a renderer is given without a template', async () => {
    inlineRenderingService.renderSms.mockResolvedValue({ body: '🎉'.repeat(36) })

    const payload = request({
      recipients: { to: ['+15551234567'] },
      content: { body: 'Hi {{name}}', renderer: 'handlebars' },
    })

    expect(await service.countSegmentsPerRecipient('tenant-1', payload)).toBe(2)
    expect(inlineRenderingService.renderSms).toHaveBeenCalled()
  })

  it('falls back to the literal body when the template is missing or not an SMS template', async () => {
    templatesRepository.findById.mockResolvedValue(null)
    const payload = request({
      recipients: { to: ['+15551234567'] },
      content: { templateId: 'tpl-1', body: 'a'.repeat(200) },
    })
    expect(await service.countSegmentsPerRecipient('tenant-1', payload)).toBe(2)
  })

  it('bills a single segment when rendering fails rather than throwing', async () => {
    templatesRepository.findById.mockResolvedValue({ id: 'tpl-1', channelCode: 'SMS' })
    templatesService.renderTemplateContent.mockRejectedValue(new Error('missing personalisation'))

    const payload = request({
      recipients: { to: ['+15551234567'] },
      content: { templateId: 'tpl-1' },
    })
    expect(await service.countSegmentsPerRecipient('tenant-1', payload)).toBe(1)
  })
})

describe('SmsSegmentService.countMergeSegments', () => {
  const templatesRepository = { findById: vi.fn() }
  const templatesService = { renderTemplateContent: vi.fn() }
  const inlineRenderingService = { renderSms: vi.fn() }

  const service = new SmsSegmentService(
    templatesRepository as unknown as TemplatesRepository,
    templatesService as unknown as TemplatesService,
    inlineRenderingService as unknown as InlineRenderingService,
  )

  const merge = {
    params: { office: 'Victoria' },
    sms: { content: { templateId: 'tpl-1' }, params: { office: 'Nanaimo', code: 'X' } },
  } as unknown as NotifySimpleRequest

  beforeEach(() => {
    vi.clearAllMocks()
    templatesRepository.findById.mockResolvedValue({ id: 'tpl-1', channelCode: 'SMS' })
  })

  it('sums each row on its own rendered body', async () => {
    templatesService.renderTemplateContent.mockImplementation(
      (_template, params: { name: string }) =>
        Promise.resolve({ body: params.name === 'Alice' ? 'a'.repeat(400) : 'short' }),
    )

    // 3 segments + 1 segment; a uniform count would have billed 2 or 6.
    expect(
      await service.countMergeSegments('tenant-1', merge, [{ name: 'Alice' }, { name: 'Bob' }]),
    ).toBe(4)
  })

  it('looks the template up once however many rows there are', async () => {
    templatesService.renderTemplateContent.mockResolvedValue({ body: 'short' })
    const rows = Array.from({ length: 50 }, (_, i) => ({ name: `row-${i}` }))

    expect(await service.countMergeSegments('tenant-1', merge, rows)).toBe(50)
    expect(templatesRepository.findById).toHaveBeenCalledTimes(1)
    expect(templatesService.renderTemplateContent).toHaveBeenCalledTimes(50)
  })

  it("renders each row with its own params over the channel's and the request's", async () => {
    templatesService.renderTemplateContent.mockResolvedValue({ body: 'short' })

    await service.countMergeSegments('tenant-1', merge, [{ office: 'Surrey' }])

    expect(templatesService.renderTemplateContent).toHaveBeenCalledWith(
      { id: 'tpl-1', channelCode: 'SMS' },
      { office: 'Surrey', code: 'X' },
    )
  })

  it('bills a row that fails to render as one segment without failing the others', async () => {
    templatesService.renderTemplateContent
      .mockResolvedValueOnce({ body: 'a'.repeat(400) })
      .mockRejectedValueOnce(new Error('missing personalisation'))

    expect(await service.countMergeSegments('tenant-1', merge, [{}, {}])).toBe(4)
  })

  it('bills one segment per row when the template lookup fails', async () => {
    templatesRepository.findById.mockRejectedValue(new Error('database down'))

    expect(await service.countMergeSegments('tenant-1', merge, [{}, {}, {}])).toBe(3)
    expect(templatesService.renderTemplateContent).not.toHaveBeenCalled()
  })
})
