import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { TemplatePreviewDataDto } from './template-preview-data.dto'
import { CreateTemplateDto } from './create-template.dto'
import { NotificationChannel } from '../../../enum/notification-channel.enum'

describe('preview data validation', () => {
  it.each([{}, { firstName: 'Jane', empty: '', approved: 'false' }])(
    'accepts a string map %j',
    async (params) => {
      expect(await validate(plainToInstance(TemplatePreviewDataDto, { params }))).toEqual([])
    },
  )

  it.each([
    undefined,
    null,
    [],
    'text',
    42,
    { approved: false },
    { count: 5 },
    { nested: {} },
    { list: [] },
  ])('rejects invalid params %j', async (params) => {
    expect(await validate(plainToInstance(TemplatePreviewDataDto, { params }))).not.toHaveLength(0)
  })

  it('validates optional creation values using the same string-map constraint', async () => {
    const base = {
      name: 'Welcome',
      channelCode: NotificationChannel.EMAIL,
      subject: 'Hi',
      body: 'Hello',
    }
    expect(await validate(plainToInstance(CreateTemplateDto, base))).toEqual([])
    expect(
      await validate(
        plainToInstance(CreateTemplateDto, { ...base, previewParams: { name: 'Jane' } }),
      ),
    ).toEqual([])
    for (const previewParams of [null, [], { approved: false }]) {
      const errors = await validate(plainToInstance(CreateTemplateDto, { ...base, previewParams }))
      expect(errors.some((error) => error.property === 'previewParams')).toBe(true)
    }
  })
})
