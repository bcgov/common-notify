import { TemplateOrContentValidator } from './template-or-content.validator'
import { NotifySimpleRequest } from '../notify-simple-request'
import { NotifyEmailChannel } from '../notify-email-channel'
import { NotifySmsChannel } from '../notify-sms-channel'

describe('TemplateOrContentValidator', () => {
  describe('validate', () => {
    it('should accept request with templateId only', () => {
      const request = new NotifySimpleRequest()
      request.templateId = '550e8400-e29b-41d4-a716-446655440000'

      const result = TemplateOrContentValidator.validate(request)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should accept request with email content only (no templateId)', () => {
      const request = new NotifySimpleRequest()
      request.email = new NotifyEmailChannel()
      request.email.recipients = {
        to: ['test@example.com'],
      }
      request.email.content = {
        subject: 'Test Subject',
        body: 'Test Body',
      }

      const result = TemplateOrContentValidator.validate(request)
      expect(result.valid).toBe(true)
    })

    it('should accept request with sms content only (no templateId)', () => {
      const request = new NotifySimpleRequest()
      request.sms = new NotifySmsChannel()
      request.sms.recipients = {
        to: ['+16045551234'],
      }
      request.sms.content = {
        body: 'Test SMS',
      }

      const result = TemplateOrContentValidator.validate(request)
      expect(result.valid).toBe(true)
    })

    it('should accept request with both email and sms content (no templateId)', () => {
      const request = new NotifySimpleRequest()
      request.email = new NotifyEmailChannel()
      request.email.recipients = {
        to: ['test@example.com'],
      }
      request.email.content = {
        subject: 'Test Subject',
        body: 'Test Body',
      }
      request.sms = new NotifySmsChannel()
      request.sms.recipients = {
        to: ['+16045551234'],
      }
      request.sms.content = {
        body: 'Test SMS',
      }

      const result = TemplateOrContentValidator.validate(request)
      expect(result.valid).toBe(true)
    })

    it('should reject request with both templateId and email content', () => {
      const request = new NotifySimpleRequest()
      request.templateId = '550e8400-e29b-41d4-a716-446655440000'
      request.email = new NotifyEmailChannel()
      request.email.recipients = {
        to: ['test@example.com'],
      }
      request.email.content = {
        subject: 'Test Subject',
        body: 'Test Body',
      }

      const result = TemplateOrContentValidator.validate(request)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Request must provide either templateId OR content')
    })

    it('should reject request with both templateId and sms content', () => {
      const request = new NotifySimpleRequest()
      request.templateId = '550e8400-e29b-41d4-a716-446655440000'
      request.sms = new NotifySmsChannel()
      request.sms.recipients = {
        to: ['+16045551234'],
      }
      request.sms.content = {
        body: 'Test SMS',
      }

      const result = TemplateOrContentValidator.validate(request)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Request must provide either templateId OR content')
    })

    it('should reject request with neither templateId nor content', () => {
      const request = new NotifySimpleRequest()

      const result = TemplateOrContentValidator.validate(request)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Request must provide either templateId OR content')
    })

    it('should accept request with templateId but empty channels', () => {
      const request = new NotifySimpleRequest()
      request.templateId = '550e8400-e29b-41d4-a716-446655440000'
      request.email = new NotifyEmailChannel()
      request.email.recipients = {
        to: ['test@example.com'],
      }
      // No content

      const result = TemplateOrContentValidator.validate(request)
      expect(result.valid).toBe(true)
    })

    it('should accept request with email subject only (no body) when no templateId', () => {
      const request = new NotifySimpleRequest()
      request.email = new NotifyEmailChannel()
      request.email.recipients = {
        to: ['test@example.com'],
      }
      request.email.content = {
        subject: 'Test Subject',
      }
      // No body

      const result = TemplateOrContentValidator.validate(request)
      expect(result.valid).toBe(true)
    })

    it('should accept request with email body only (no subject) when no templateId', () => {
      const request = new NotifySimpleRequest()
      request.email = new NotifyEmailChannel()
      request.email.recipients = { to: ['test@example.com'] }
      request.email.content = { body: 'Test Body' }
      // No subject

      const result = TemplateOrContentValidator.validate(request)
      expect(result.valid).toBe(true)
    })

    it('should reject request with templateId and email subject only', () => {
      const request = new NotifySimpleRequest()
      request.templateId = '550e8400-e29b-41d4-a716-446655440000'
      request.email = new NotifyEmailChannel()
      request.email.recipients = { to: ['test@example.com'] }
      request.email.content = { subject: 'Test Subject' }

      const result = TemplateOrContentValidator.validate(request)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Request must provide either templateId OR content')
    })

    it('should reject request with templateId and email body only', () => {
      const request = new NotifySimpleRequest()
      request.templateId = '550e8400-e29b-41d4-a716-446655440000'
      request.email = new NotifyEmailChannel()
      request.email.recipients = { to: ['test@example.com'] }
      request.email.content = { body: 'Test Body' }

      const result = TemplateOrContentValidator.validate(request)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Request must provide either templateId OR content')
    })

    it('should accept request with a channel-level templateId (no top-level templateId or content)', () => {
      const request = new NotifySimpleRequest()
      request.email = new NotifyEmailChannel()
      request.email.recipients = { to: ['test@example.com'] }
      request.email.templateId = '550e8400-e29b-41d4-a716-446655440000'
      // No top-level templateId, no inline content

      const result = TemplateOrContentValidator.validate(request)
      expect(result.valid).toBe(true)
    })
  })
})
