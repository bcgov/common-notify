import { describe, it, expect } from 'vitest'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { NotifySimpleRequest } from './notify-simple-request'
import { NotifyEmailChannel } from './notify-email-channel'
import { NotifySmsChannel } from './notify-sms-channel'

describe('NotifySimpleRequest', () => {
  describe('Valid Instance Creation', () => {
    it('should create a valid instance with email channel', async () => {
      const data = {
        email: {
          recipients: ['test@example.com'],
          subject: 'Test',
          body: 'Test body',
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.email).toBeDefined()
      expect(instance.email?.recipients).toEqual(['test@example.com'])
    })

    it('should create a valid instance with sms channel', async () => {
      const data = {
        sms: {
          recipients: ['+16045551234', '+16045555678'],
          body: 'Test SMS',
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
          recipients: ['test@example.com'],
          subject: 'Test',
          body: 'Test body',
        },
        sms: {
          recipients: ['+16045551234', '+16045555678'],
          body: 'Test SMS',
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
          recipients: ['test@example.com'],
          subject: 'Test',
          body: 'Test body',
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
          recipients: ['test@example.com'],
          subject: 'Test',
          body: 'Test body',
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
          recipients: ['+16045551234'],
          body: 'Test SMS',
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
          recipients: ['test@example.com'],
          subject: 'Test',
          body: 'Test body',
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
          recipients: ['test@example.com'],
          subject: 'Test',
          body: 'Test body',
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
          recipients: ['test@example.com'],
          subject: 'Test',
          body: 'Test body',
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
          recipients: ['test@example.com'],
          cc: ['cc@example.com'],
          bcc: ['bcc@example.com'],
          subject: 'Test',
          body: 'Test body',
          bodyType: 'html',
          priority: 'high',
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)

      expect(instance.email).toBeInstanceOf(NotifyEmailChannel)
      expect(instance.email?.recipients).toEqual(['test@example.com'])
      expect(instance.email?.cc).toEqual(['cc@example.com'])
      expect(instance.email?.bcc).toEqual(['bcc@example.com'])
      expect(instance.email?.bodyType).toBe('html')
      expect(instance.email?.priority).toBe('high')
    })

    it('should transform sms to NotifySmsChannel instance', async () => {
      const data = {
        sms: {
          recipients: ['+16045551234'],
          body: 'Test SMS',
          priority: 'normal',
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
          recipients: ['test@example.com'],
          subject: 'Test',
          body: 'Test body',
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
          recipients: ['test@example.com'],
          subject: 'Test',
          body: 'Test body',
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
          recipients: ['test@example.com'],
          subject: 'Test',
          body: 'Test body',
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
          recipients: ['test@example.com'],
          subject: 'Test',
          body: 'Test body',
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
          recipients: ['test@example.com'],
          subject: 'Test',
          body: 'Test body',
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
          recipients: ['test@example.com'],
          subject: 'Test',
          body: 'Test body',
          delayedSend: '2026-04-28T10:00:00Z',
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.email?.delayedSend).toBe('2026-04-28T10:00:00Z')
    })

    it('should accept ISO 8601 date format with offset for delayedSend', async () => {
      const data = {
        email: {
          recipients: ['test@example.com'],
          subject: 'Test',
          body: 'Test body',
          delayedSend: '2026-04-28T10:00:00-07:00',
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.email?.delayedSend).toBe('2026-04-28T10:00:00-07:00')
    })

    it('should accept relaxed date format with timezone abbreviation', async () => {
      const data = {
        email: {
          recipients: ['test@example.com'],
          subject: 'Test',
          body: 'Test body',
          delayedSend: '2026-04-28 10:00:00 PST',
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.email?.delayedSend).toBe('2026-04-28 10:00:00 PST')
    })

    it('should reject date format without timezone', async () => {
      const data = {
        email: {
          recipients: ['test@example.com'],
          subject: 'Test',
          body: 'Test body',
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
          recipients: ['test@example.com'],
          subject: 'Test',
          body: 'Test body',
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
          recipients: ['+16045551234'],
          body: 'Test SMS',
          delayedSend: '2026-04-28T10:00:00Z',
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.sms?.delayedSend).toBe('2026-04-28T10:00:00Z')
    })

    it('should be optional field', async () => {
      const data = {
        email: {
          recipients: ['test@example.com'],
          subject: 'Test',
          body: 'Test body',
          // No delayedSend field
        },
      }

      const instance = plainToInstance(NotifySimpleRequest, data)
      const errors = await validate(instance)

      expect(errors).toHaveLength(0)
      expect(instance.email?.delayedSend).toBeUndefined()
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
          recipients: ['test@example.com'],
          subject: 'Test',
          body: 'Test body',
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
