import { describe, it, expect } from 'vitest'
import {
  getRenderingStrategy,
  isInlineRendering,
  isTemplateBasedRendering,
} from './rendering.strategy'
import type { NotifyEmailChannel } from './schemas/notify-email-channel'
import type { NotifySmsChannel } from './schemas/notify-sms-channel'
import type { NotifyMsgAppChannel } from './schemas/notify-msg-app-channel'

describe('Rendering Strategy', () => {
  describe('getRenderingStrategy', () => {
    describe('for email channel', () => {
      it('should return template when templateId is provided', () => {
        const channel: NotifyEmailChannel = {
          templateId: 'template-123',
          recipients: { to: ['test@example.com'] },
        }

        const result = getRenderingStrategy(channel)

        expect(result).toBe('template')
      })

      it('should return inline when content.renderer is provided', () => {
        const channel: NotifyEmailChannel = {
          recipients: { to: ['test@example.com'] },
          content: {
            subject: 'Test Subject',
            body: 'Test body',
            renderer: 'handlebars',
          },
        }

        const result = getRenderingStrategy(channel)

        expect(result).toBe('inline')
      })

      it('should return null when neither templateId nor content.renderer provided', () => {
        const channel: NotifyEmailChannel = {
          recipients: { to: ['test@example.com'] },
        }

        const result = getRenderingStrategy(channel)

        expect(result).toBeNull()
      })

      it('should prefer templateId over inline content', () => {
        const channel: NotifyEmailChannel = {
          templateId: 'template-123',
          recipients: { to: ['test@example.com'] },
          content: {
            subject: 'Test Subject',
            body: 'Test body',
            renderer: 'handlebars',
          },
        }

        const result = getRenderingStrategy(channel)

        expect(result).toBe('template')
      })

      it('should return null when content exists but renderer is not specified', () => {
        const channel: NotifyEmailChannel = {
          recipients: { to: ['test@example.com'] },
          content: {
            subject: 'Test Subject',
            body: 'Test body',
          },
        }

        const result = getRenderingStrategy(channel)

        expect(result).toBeNull()
      })
    })

    describe('for SMS channel', () => {
      it('should return template when templateId is provided', () => {
        const channel: NotifySmsChannel = {
          templateId: 'template-456',
          recipients: { to: ['+12025551234'] },
        }

        const result = getRenderingStrategy(channel)

        expect(result).toBe('template')
      })

      it('should return inline when content.renderer is provided', () => {
        const channel: NotifySmsChannel = {
          recipients: { to: ['+12025551234'] },
          content: {
            body: 'Test SMS',
            renderer: 'mustache',
          },
        }

        const result = getRenderingStrategy(channel)

        expect(result).toBe('inline')
      })

      it('should return null when neither templateId nor content.renderer provided', () => {
        const channel: NotifySmsChannel = {
          recipients: { to: ['+12025551234'] },
        }

        const result = getRenderingStrategy(channel)

        expect(result).toBeNull()
      })

      it('should prefer templateId over inline content', () => {
        const channel: NotifySmsChannel = {
          templateId: 'template-456',
          recipients: { to: ['+12025551234'] },
          content: {
            body: 'Test SMS',
            renderer: 'mustache',
          },
        }

        const result = getRenderingStrategy(channel)

        expect(result).toBe('template')
      })
    })

    describe('for msgApp channel', () => {
      it('should return template when templateId is provided', () => {
        const channel: NotifyMsgAppChannel = {
          templateId: 'template-789',
          recipients: { to: ['user-123'] },
        }

        const result = getRenderingStrategy(channel)

        expect(result).toBe('template')
      })

      it('should return inline when content.renderer is provided', () => {
        const channel: NotifyMsgAppChannel = {
          recipients: { to: ['user-123'] },
          content: {
            body: 'Test message',
            renderer: 'handlebars',
          },
        }

        const result = getRenderingStrategy(channel)

        expect(result).toBe('inline')
      })

      it('should return null when neither templateId nor content.renderer provided', () => {
        const channel: NotifyMsgAppChannel = {
          recipients: { to: ['user-123'] },
        }

        const result = getRenderingStrategy(channel)

        expect(result).toBeNull()
      })

      it('should handle empty recipients with template', () => {
        const channel: NotifyMsgAppChannel = {
          templateId: 'template-789',
          recipients: { to: [] },
        }

        const result = getRenderingStrategy(channel)

        expect(result).toBe('template')
      })

      it('should handle empty recipients with inline rendering', () => {
        const channel: NotifyMsgAppChannel = {
          recipients: { to: [] },
          content: {
            body: 'Test message',
            renderer: 'mustache',
          },
        }

        const result = getRenderingStrategy(channel)

        expect(result).toBe('inline')
      })
    })

    describe('edge cases', () => {
      it('should handle undefined templateId', () => {
        const channel: NotifyEmailChannel = {
          templateId: undefined,
          recipients: { to: ['test@example.com'] },
          content: {
            subject: 'Test',
            body: 'Body',
            renderer: 'handlebars',
          },
        }

        const result = getRenderingStrategy(channel)

        expect(result).toBe('inline')
      })

      it('should handle empty string templateId as falsy', () => {
        const channel: NotifyEmailChannel = {
          templateId: '' as any,
          recipients: { to: ['test@example.com'] },
          content: {
            subject: 'Test',
            body: 'Body',
            renderer: 'handlebars',
          },
        }

        const result = getRenderingStrategy(channel)

        expect(result).toBe('inline')
      })

      it('should handle undefined content', () => {
        const channel: NotifyEmailChannel = {
          recipients: { to: ['test@example.com'] },
          content: undefined,
        }

        const result = getRenderingStrategy(channel)

        expect(result).toBeNull()
      })

      it('should handle undefined content.renderer', () => {
        const channel: NotifyEmailChannel = {
          recipients: { to: ['test@example.com'] },
          content: {
            subject: 'Test',
            body: 'Body',
            renderer: undefined,
          },
        }

        const result = getRenderingStrategy(channel)

        expect(result).toBeNull()
      })

      it('should handle all different renderer types', () => {
        const renderers = ['handlebars', 'mustache', 'legacy-gc-notify', 'mjml'] as const

        for (const renderer of renderers) {
          const channel: NotifyEmailChannel = {
            recipients: { to: ['test@example.com'] },
            content: {
              subject: 'Test',
              body: 'Body',
              renderer,
            },
          }

          const result = getRenderingStrategy(channel)

          expect(result).toBe('inline')
        }
      })
    })
  })

  describe('isInlineRendering', () => {
    it('should return true when content.renderer is specified', () => {
      const channel: NotifyEmailChannel = {
        recipients: { to: ['test@example.com'] },
        content: {
          subject: 'Test',
          body: 'Body',
          renderer: 'handlebars',
        },
      }

      const result = isInlineRendering(channel)

      expect(result).toBe(true)
    })

    it('should return false when templateId is specified', () => {
      const channel: NotifyEmailChannel = {
        templateId: 'template-123',
        recipients: { to: ['test@example.com'] },
      }

      const result = isInlineRendering(channel)

      expect(result).toBe(false)
    })

    it('should return false when neither is specified', () => {
      const channel: NotifyEmailChannel = {
        recipients: { to: ['test@example.com'] },
      }

      const result = isInlineRendering(channel)

      expect(result).toBe(false)
    })

    it('should prefer templateId over inline rendering when both specified', () => {
      const channel: NotifyEmailChannel = {
        templateId: 'template-123',
        recipients: { to: ['test@example.com'] },
        content: {
          subject: 'Test',
          body: 'Body',
          renderer: 'handlebars',
        },
      }

      const result = isInlineRendering(channel)

      expect(result).toBe(false)
    })

    it('should work with SMS channel', () => {
      const channel: NotifySmsChannel = {
        recipients: { to: ['+12025551234'] },
        content: {
          body: 'Test SMS',
          renderer: 'mustache',
        },
      }

      const result = isInlineRendering(channel)

      expect(result).toBe(true)
    })

    it('should work with msgApp channel', () => {
      const channel: NotifyMsgAppChannel = {
        recipients: { to: ['user-123'] },
        content: {
          body: 'Test',
          renderer: 'mustache',
        },
      }

      const result = isInlineRendering(channel)

      expect(result).toBe(true)
    })
  })

  describe('isTemplateBasedRendering', () => {
    it('should return true when templateId is specified', () => {
      const channel: NotifyEmailChannel = {
        templateId: 'template-123',
        recipients: { to: ['test@example.com'] },
      }

      const result = isTemplateBasedRendering(channel)

      expect(result).toBe(true)
    })

    it('should return false when content.renderer is specified', () => {
      const channel: NotifyEmailChannel = {
        recipients: { to: ['test@example.com'] },
        content: {
          subject: 'Test',
          body: 'Body',
          renderer: 'handlebars',
        },
      }

      const result = isTemplateBasedRendering(channel)

      expect(result).toBe(false)
    })

    it('should return false when neither is specified', () => {
      const channel: NotifyEmailChannel = {
        recipients: { to: ['test@example.com'] },
      }

      const result = isTemplateBasedRendering(channel)

      expect(result).toBe(false)
    })

    it('should prefer templateId when both specified', () => {
      const channel: NotifyEmailChannel = {
        templateId: 'template-123',
        recipients: { to: ['test@example.com'] },
        content: {
          subject: 'Test',
          body: 'Body',
          renderer: 'handlebars',
        },
      }

      const result = isTemplateBasedRendering(channel)

      expect(result).toBe(true)
    })

    it('should work with SMS channel', () => {
      const channel: NotifySmsChannel = {
        templateId: 'template-456',
        recipients: { to: ['+12025551234'] },
      }

      const result = isTemplateBasedRendering(channel)

      expect(result).toBe(true)
    })

    it('should work with msgApp channel', () => {
      const channel: NotifyMsgAppChannel = {
        templateId: 'template-789',
        recipients: { to: ['user-123'] },
      }

      const result = isTemplateBasedRendering(channel)

      expect(result).toBe(true)
    })

    it('should return false with SMS and inline rendering', () => {
      const channel: NotifySmsChannel = {
        recipients: { to: ['+12025551234'] },
        content: {
          body: 'Test SMS',
          renderer: 'mustache',
        },
      }

      const result = isTemplateBasedRendering(channel)

      expect(result).toBe(false)
    })
  })

  describe('consistency between functions', () => {
    it('should have isInlineRendering and isTemplateBasedRendering be mutually exclusive', () => {
      const testCases = [
        { templateId: 'template-123' },
        { content: { renderer: 'handlebars' } },
        {},
      ]

      for (const testCase of testCases) {
        const channel = { ...testCase, recipients: { to: ['test@example.com'] } } as any
        const inline = isInlineRendering(channel)
        const template = isTemplateBasedRendering(channel)

        expect(inline && template).toBe(false) // Should never both be true
      }
    })

    it('should return true for exactly one of three functions (or null for all)', () => {
      const testCases = [
        { templateId: 'template-123' },
        { content: { renderer: 'handlebars' } },
        {},
      ]

      for (const testCase of testCases) {
        const channel = { ...testCase, recipients: { to: ['test@example.com'] } } as any
        const strategy = getRenderingStrategy(channel)
        const inline = isInlineRendering(channel)
        const template = isTemplateBasedRendering(channel)

        if (strategy === 'inline') {
          expect(inline).toBe(true)
          expect(template).toBe(false)
        } else if (strategy === 'template') {
          expect(inline).toBe(false)
          expect(template).toBe(true)
        } else {
          expect(inline).toBe(false)
          expect(template).toBe(false)
        }
      }
    })
  })
})
