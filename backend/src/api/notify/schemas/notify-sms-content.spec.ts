import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { NotifySmsChannel } from './notify-sms-channel'

/**
 * The SMS channel takes NotifySmsContent, not the full NotifyContent. With the global
 * ValidationPipe's forbidNonWhitelisted, a field an SMS does not have is a 400 rather than a value
 * that is silently dropped - so these assert the contract, not just the published schema.
 */
const validateContent = async (content: Record<string, unknown>) => {
  const channel = plainToInstance(NotifySmsChannel, {
    recipients: { to: ['+12505550123'] },
    content,
  })
  const errors = await validate(channel, { whitelist: true, forbidNonWhitelisted: true })
  return errors.flatMap((error) =>
    (error.children ?? []).flatMap((c) => Object.keys(c.constraints ?? {})),
  )
}

describe('NotifySmsContent', () => {
  it.each([
    [
      'an inline body and renderer',
      { body: 'Your appointment is at 09:00.', renderer: 'handlebars' },
    ],
    ['a stored template', { templateId: '3f1a7c2e-9b45-4d10-8e21-6c0f5a9b7d33' }],
  ])('accepts %s', async (_label, content) => {
    expect(await validateContent(content)).toEqual([])
  })

  it.each(['subject', 'bodyType', 'encoding'])(
    'rejects %s, which an SMS does not have',
    async (field) => {
      expect(await validateContent({ body: 'hi', [field]: 'x' })).toContain('whitelistValidation')
    },
  )
})
