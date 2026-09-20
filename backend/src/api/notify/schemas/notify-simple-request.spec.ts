import { describe, it, expect } from 'vitest'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { NotifySimpleRequest } from './notify-simple-request'
import { NotifyEmailChannel } from './notify-email-channel'
import { NotifySmsChannel } from './notify-sms-channel'

// Scheduling fixtures are computed, not hard-coded: a literal date silently becomes invalid the
// day it passes, and delayedSend now rejects times in the past.
const futureIso = (msAhead = 24 * 60 * 60 * 1000) => new Date(Date.now() + msAhead).toISOString()
const futureOffset = () => futureIso().replace('Z', '+00:00')
/** The same future instant written as a PDT (UTC-7) wall-clock time. */
const futurePdt = () =>
  new Date(Date.now() + 24 * 60 * 60 * 1000 - 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ') + ' PDT'

describe('NotifySimpleRequest', () => {
  describe('scheduling fields require a timezone', () => {
    const recipients = { to: ['test@example.com'] }
    const scheduleErrors = async (delayedSend: string) =>
      validate(
        plainToInstance(NotifySimpleRequest, {
          email: { recipients, content: { body: 'Hello' }, delayedSend },
        }),
      )

    it.each([
      ['a Z suffix', futureIso],
      ['a numeric offset', futureOffset],
      ['a timezone abbreviation', futurePdt],
    ])('accepts %s', async (_label, build) => {
      expect(await scheduleErrors(build())).toHaveLength(0)
    })

    it('rejects a time in the past', async () => {
      expect(
        await scheduleErrors(new Date(Date.now() - 60 * 60_000).toISOString()),
      ).not.toHaveLength(0)
    })

    it.each(['2026-06-01T16:00:00', '2026-06-01', '2026-06-01T09:00:00-0700', 'next tuesday'])(
      'rejects %s',
      async (value) => {
        expect(await scheduleErrors(value)).not.toHaveLength(0)
      },
    )
  })

  describe('a stored template owns its own rendering', () => {
    const TEMPLATE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
    const recipients = { to: ['test@example.com'] }

    const errorsFor = async (content: Record<string, unknown>) =>
      validate(plainToInstance(NotifySimpleRequest, { email: { recipients, content } }))

    it('accepts a templateId on its own', async () => {
      expect(await errorsFor({ templateId: TEMPLATE_ID })).toHaveLength(0)
    })

    it.each(['renderer', 'bodyType', 'encoding'])(
      'rejects a templateId combined with %s',
      async (field) => {
        const value =
          field === 'renderer' ? 'handlebars' : field === 'bodyType' ? 'markdown' : 'utf-8'
        expect(await errorsFor({ templateId: TEMPLATE_ID, [field]: value })).not.toHaveLength(0)
      },
    )

    it('still allows bodyType and encoding alongside inline content', async () => {
      const errors = await errorsFor({ body: 'Hello', bodyType: 'markdown', encoding: 'utf-8' })
      expect(errors).toHaveLength(0)
    })

    // The channel-level rule also has to hold for /notifysimple/email, which posts a bare channel
    // and never reaches the request-level constraint.
    it('rejects a templateId combined with bodyType on the shorthand route', async () => {
      const errors = await validate(
        plainToInstance(NotifyEmailChannel, {
          recipients,
          content: { templateId: TEMPLATE_ID, bodyType: 'markdown' },
        }),
      )
      expect(errors).not.toHaveLength(0)
    })
  })

  describe('Valid Instance Creation', () => {
    it('should create a valid instance with email channel', async () => {
      const data = {
        email: {
          recipients: {
            to: ['test@example.com'],
          },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.email).toBeDefined()
      expect(instance.email?.recipients.to).toEqual(['test@example.com'])
    })

    it('should create a valid instance with sms channel', async () => {
      const data = {
        sms: {
          recipients: {
            to: ['+16045551234', '+16045555678'],
          },
          content: {
            body: 'Test SMS',
          },
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.sms).toBeDefined()
    })

    it('should create a valid instance with email and sms channels', async () => {
      const data = {
        email: {
          recipients: {
            to: ['test@example.com'],
          },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
        },
        sms: {
          recipients: {
            to: ['+16045551234', '+16045555678'],
          },
          content: {
            body: 'Test SMS',
          },
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.email).toBeDefined()
      expect(instance.sms).toBeDefined()
    })

    it('should create instance with params', async () => {
      const data = {
        params: {
          userId: '123',
          tenantId: '456',
          custom: 'value',
        },
        email: {
          recipients: {
            to: ['test@example.com'],
          },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.params).toEqual({
        userId: '123',
        tenantId: '456',
        custom: 'value',
      })
    })

    it('should accept mjml as a valid renderer', async () => {
      const data = {
        email: {
          recipients: {
            to: ['test@example.com'],
          },
          content: {
            subject: 'Welcome {{name}}',
            body: '<mjml><mj-body><mj-section><mj-column><mj-text>Hello {{name}}</mj-text></mj-column></mj-section></mj-body></mjml>',
            renderer: 'mjml',
          },
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.email?.content?.renderer).toBe('mjml')
    })
  })

  describe('Optional Fields', () => {
    it('should allow empty object', async () => {
      const data = {}

      const instance = plainToInstance(NotifySimpleRequest, data)

      // At least one channel should be required in the service, but schema allows empty
      expect(instance.email).toBeUndefined()
      expect(instance.sms).toBeUndefined()
      expect(instance.params).toBeUndefined()
    })

    it('should allow only email channel', async () => {
      const data = {
        email: {
          recipients: {
            to: ['test@example.com'],
          },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.sms).toBeUndefined()
    })

    it('should allow only sms channel', async () => {
      const data = {
        sms: {
          recipients: {
            to: ['+16045551234'],
          },
          content: {
            body: 'Test SMS',
          },
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.email).toBeUndefined()
    })
  })

  describe('Params Validation', () => {
    it('should accept params as object', async () => {
      const data = {
        params: {
          key1: 'value1',
          key2: 123,
          key3: true,
        },
        email: {
          recipients: {
            to: ['test@example.com'],
          },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.params).toEqual({
        key1: 'value1',
        key2: 123,
        key3: true,
      })
    })

    it('should accept empty params object', async () => {
      const data = {
        params: {},
        email: {
          recipients: {
            to: ['test@example.com'],
          },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.params).toEqual({})
    })

    it('should reject params if not an object', async () => {
      const data = {
        params: 'not an object',
        email: {
          recipients: {
            to: ['test@example.com'],
          },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance, { skipMissingProperties: false })

      // The IsObject validation should catch this
      const paramsErrors = errors.filter((err) => err.property === 'params')
      expect(paramsErrors.length).toBeGreaterThan(0)
    })
  })

  describe('Nested Type Transformation', () => {
    it('should transform email to NotifyEmailChannel instance', async () => {
      const data = {
        email: {
          recipients: {
            to: ['test@example.com'],
            cc: ['cc@example.com'],
            bcc: ['bcc@example.com'],
          },
          content: {
            content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
            renderer: 'handlebars',
          },
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)

      expect(instance.email).toBeInstanceOf(NotifyEmailChannel)
      expect(instance.email?.recipients.to).toEqual(['test@example.com'])
      expect(instance.email?.recipients.cc).toEqual(['cc@example.com'])
      expect(instance.email?.recipients.bcc).toEqual(['bcc@example.com'])
    })

    it('should transform sms to NotifySmsChannel instance', async () => {
      const data = {
        sms: {
          recipients: {
            to: ['+16045551234'],
          },
          content: {
            body: 'Test SMS',
          },
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)

      // Note: We should validate that sms is transformed correctly
      expect(instance.sms).toBeDefined()
      if (instance.sms) {
        expect(instance.sms).toBeInstanceOf(NotifySmsChannel)
      }
    })
  })

  describe('Type Coercion', () => {
    it('should handle numeric values in params', async () => {
      const data = {
        params: {
          count: 42,
          price: 19.99,
          timestamp: 1234567890,
        },
        email: {
          recipients: {
            to: ['test@example.com'],
          },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.params?.count).toBe(42)
      expect(instance.params?.price).toBe(19.99)
    })

    it('should handle boolean values in params', async () => {
      const data = {
        params: {
          isActive: true,
          isDeleted: false,
        },
        email: {
          recipients: {
            to: ['test@example.com'],
          },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.params?.isActive).toBe(true)
      expect(instance.params?.isDeleted).toBe(false)
    })

    it('should handle null values in params', async () => {
      const data = {
        params: {
          nullValue: null,
          undefinedValue: undefined,
        },
        email: {
          recipients: {
            to: ['test@example.com'],
          },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.params?.nullValue).toBeNull()
    })
  })

  describe('Instance Properties', () => {
    it('should preserve all properties correctly', async () => {
      const data = {
        params: { key: 'value' },
        email: {
          recipients: { to: ['test@example.com'] },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
        },
        sms: {
          recipients: '+16045551234',
          body: 'Test SMS',
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)

      expect(Object.keys(instance).sort()).toEqual(['email', 'msgApp', 'params', 'sms'].sort())
    })

    it('should handle deeply nested params', async () => {
      const data = {
        params: {
          level1: {
            level2: {
              level3: 'deep value',
            },
          },
        },
        email: {
          recipients: { to: ['test@example.com'] },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.params?.level1).toBeDefined()
      // Note: Nested object structure should be preserved
    })
  })

  describe('DelayedSend Validation', () => {
    it('should accept ISO 8601 date format with Z for delayedSend', async () => {
      const data = {
        email: {
          recipients: { to: ['test@example.com'] },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
          delayedSend: futureIso(),
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.email?.delayedSend).toBeDefined()
    })

    it('should accept ISO 8601 date format with offset for delayedSend', async () => {
      const data = {
        email: {
          recipients: { to: ['test@example.com'] },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
          delayedSend: futureOffset(),
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.email?.delayedSend).toBeDefined()
    })

    it('should accept relaxed date format with timezone abbreviation', async () => {
      const delayedSend = futurePdt()
      const data = {
        email: {
          recipients: { to: ['test@example.com'] },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
          delayedSend,
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.email?.delayedSend).toBe(delayedSend)
    })

    it('should reject date format without timezone', async () => {
      const data = {
        email: {
          recipients: { to: ['test@example.com'] },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
          delayedSend: '2026-04-28 10:00:00',
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      const delayedSendErrors = errors.filter((err) => err.property === 'email')
      expect(delayedSendErrors.length).toBeGreaterThan(0)
    })

    it('should reject invalid date format for delayedSend', async () => {
      const data = {
        email: {
          recipients: { to: ['test@example.com'] },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
          delayedSend: 'not a valid date',
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      const delayedSendErrors = errors.filter((err) => err.property === 'email')
      expect(delayedSendErrors.length).toBeGreaterThan(0)
    })

    it('should allow delayedSend with sms channel', async () => {
      const data = {
        sms: {
          recipients: { to: ['+16045551234'] },
          content: { body: 'Test SMS' },
          delayedSend: futureIso(),
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.sms?.delayedSend).toBeDefined()
    })

    it('should be optional field', async () => {
      const data = {
        email: {
          recipients: { to: ['test@example.com'] },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
          // No delayedSend field
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.email?.delayedSend).toBeUndefined()
    })
  })

  describe('Template ID Validation', () => {
    it('should accept a valid UUID content.templateId', async () => {
      const data = {
        email: {
          recipients: { to: ['test@example.com'] },
          content: { templateId: '550e8400-e29b-41d4-a716-446655440000' },
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.email?.content?.templateId).toBe('550e8400-e29b-41d4-a716-446655440000')
    })

    it('should reject an invalid UUID content.templateId', async () => {
      const data = {
        email: {
          recipients: { to: ['test@example.com'] },
          content: { templateId: 'not-a-uuid' },
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors.length).toBeGreaterThan(0)
    })

    it('should allow content.templateId to be optional', async () => {
      const data = {
        email: {
          recipients: { to: ['test@example.com'] },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.email?.content?.templateId).toBeUndefined()
    })
  })

  describe('Edge Cases', () => {
    it('should create instance with undefined channels', async () => {
      const data = {
        email: undefined,
        sms: undefined,
      }

      const instance = plainToInstance(NotifySimpleRequest, data)

      expect(instance.email).toBeUndefined()
      expect(instance.sms).toBeUndefined()
    })

    it('should filter out extra properties not in schema', () => {
      const data = {
        email: {
          recipients: { to: ['test@example.com'] },
          content: { subject: 'Test', body: 'Test body', renderer: 'handlebars' },
        },
        extraPropertyNotInSchema: 'should be ignored',
        anotherExtra: 123,
      }

      const instance = plainToInstance(NotifySimpleRequest, data, {
        excludeExtraneousValues: true,
      })

      expect(instance).not.toHaveProperty('extraPropertyNotInSchema')
      expect(instance).not.toHaveProperty('anotherExtra')
    })

    it('should handle class instantiation with no arguments', () => {
      const instance = new NotifySimpleRequest()

      expect(instance).toBeDefined()
      expect(instance.email).toBeUndefined()
      expect(instance.sms).toBeUndefined()
      expect(instance.params).toBeUndefined()
    })
  })
})
