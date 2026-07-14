import { TemplateOrContentValidator } from './template-or-content.validator'
import { NotifySimpleRequest } from '../notify-simple-request'
import { NotifyEmailChannel } from '../notify-email-channel'
import { NotifySmsChannel } from '../notify-sms-channel'

const TEMPLATE_ID = '550e8400-e29b-41d4-a716-446655440000'

describe('TemplateOrContentValidator', () => {
  describe('validate', () => {
    it('should accept an email channel with content.templateId only', () => {
      const request = new NotifySimpleRequest()
      request.email = new NotifyEmailChannel()
      request.email.recipients = { to: ['test@example.com'] }
      request.email.content = { templateId: TEMPLATE_ID }

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

    it('should reject an email channel whose content has both templateId and inline content', () => {
      const request = new NotifySimpleRequest()
      request.email = new NotifyEmailChannel()
      request.email.recipients = {
        to: ['test@example.com'],
      }
      request.email.content = {
        templateId: TEMPLATE_ID,
        subject: 'Test Subject',
        body: 'Test Body',
      }

      const result = TemplateOrContentValidator.validate(request)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('content.templateId OR inline content')
    })

    it('should reject an sms channel whose content has both templateId and a body', () => {
      const request = new NotifySimpleRequest()
      request.sms = new NotifySmsChannel()
      request.sms.recipients = {
        to: ['+16045551234'],
      }
      request.sms.content = {
        templateId: TEMPLATE_ID,
        body: 'Test SMS',
      }

      const result = TemplateOrContentValidator.validate(request)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('content.templateId OR inline content')
    })

    it('should reject request with neither templateId nor content', () => {
      const request = new NotifySimpleRequest()

      const result = TemplateOrContentValidator.validate(request)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('content.templateId OR inline content')
    })

    it('should reject a channel that provides neither templateId nor inline content', () => {
      const request = new NotifySimpleRequest()
      request.email = new NotifyEmailChannel()
      request.email.recipients = {
        to: ['test@example.com'],
      }
      // No content at all

      const result = TemplateOrContentValidator.validate(request)
      expect(result.valid).toBe(false)
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

    it('should reject an email channel with content.templateId and a subject only', () => {
      const request = new NotifySimpleRequest()
      request.email = new NotifyEmailChannel()
      request.email.recipients = { to: ['test@example.com'] }
      request.email.content = { templateId: TEMPLATE_ID, subject: 'Test Subject' }

      const result = TemplateOrContentValidator.validate(request)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('content.templateId OR inline content')
    })

    it('should reject an email channel with content.templateId and a body only', () => {
      const request = new NotifySimpleRequest()
      request.email = new NotifyEmailChannel()
      request.email.recipients = { to: ['test@example.com'] }
      request.email.content = { templateId: TEMPLATE_ID, body: 'Test Body' }

      const result = TemplateOrContentValidator.validate(request)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('content.templateId OR inline content')
    })
  })
})
