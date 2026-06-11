import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { BadRequestException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import type { RenderContext } from '../../../adapters/interfaces'
import { MjmlTemplateRenderer } from './mjml-template.renderer'

describe('MjmlTemplateRenderer', () => {
  let renderer: MjmlTemplateRenderer

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MjmlTemplateRenderer],
    }).compile()

    renderer = module.get<MjmlTemplateRenderer>(MjmlTemplateRenderer)
  })

  describe('renderEmail', () => {
    it('should compile valid MJML into HTML', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'MJML Welcome',
          type: 'email',
          subject: 'Welcome {{name}}',
          body: `
            <mjml>
              <mj-body>
                <mj-section>
                  <mj-column>
                    <mj-text>Hello {{name}}</mj-text>
                  </mj-column>
                </mj-section>
              </mj-body>
            </mjml>
          `,
          active: true,
        },
        personalisation: { name: 'John' },
        defaultSubject: 'Notification',
      }

      const result = await renderer.renderEmail(context)

      expect(result.subject).toBe('Welcome John')
      expect(result.body).toContain('<!doctype html>')
      expect(result.body).toContain('Hello John')
    })

    it('should preserve attachments for email rendering', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'MJML Attachment',
          type: 'email',
          subject: 'Attachment for {{name}}',
          body: `
            <mjml>
              <mj-body>
                <mj-section>
                  <mj-column>
                    <mj-text>See attached file for {{name}}</mj-text>
                  </mj-column>
                </mj-section>
              </mj-body>
            </mjml>
          `,
          active: true,
        },
        personalisation: {
          name: 'John',
          file: {
            file: 'path/to/document.pdf',
            filename: 'document.pdf',
            sending_method: 'attach',
          },
        },
      }

      const result = await renderer.renderEmail(context)

      expect(result.attachments).toBeDefined()
      expect(result.attachments).toHaveLength(1)
      expect(result.attachments?.[0].filename).toBe('document.pdf')
    })

    it('should throw BadRequestException for invalid MJML', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Invalid MJML',
          type: 'email',
          subject: 'Broken',
          body: `
            <mjml>
              <mj-body>
                <mj-foo>Hello {{name}}</mj-foo>
              </mj-body>
            </mjml>
          `,
          active: true,
        },
        personalisation: { name: 'John' },
      }

      await expect(renderer.renderEmail(context)).rejects.toThrow(BadRequestException)
      await expect(renderer.renderEmail(context)).rejects.toThrow(
        /MJML compilation error: Element mj-foo doesn't exist or is not registered/,
      )
    })

    it('should not allow mj-include file loading', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'mjml-renderer-'))
      const includePath = join(tempDir, 'include.mjml')
      writeFileSync(
        includePath,
        '<mj-section><mj-column><mj-text>Included Secret</mj-text></mj-column></mj-section>',
      )

      try {
        const context: RenderContext = {
          template: {
            id: 'template-1',
            name: 'MJML Include',
            type: 'email',
            subject: 'Include',
            body: `
              <mjml>
                <mj-body>
                  <mj-section>
                    <mj-column>
                      <mj-text>Visible Content</mj-text>
                    </mj-column>
                  </mj-section>
                  <mj-include path="${includePath.replace(/\\/g, '/')}" />
                </mj-body>
              </mjml>
            `,
            active: true,
          },
          personalisation: {},
        }

        const result = await renderer.renderEmail(context)

        expect(result.body).toContain('Visible Content')
        expect(result.body).not.toContain('Included Secret')
      } finally {
        rmSync(tempDir, { recursive: true, force: true })
      }
    })

    it('should render stored SMS templates as plain text through renderEmail', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'SMS via Email Path',
          type: 'sms',
          body: 'Hi {{name}}, code {{code}}',
          active: true,
        },
        personalisation: { name: 'John', code: '123456' },
      }

      const result = await renderer.renderEmail(context)

      expect(result.body).toBe('Hi John, code 123456')
    })
  })

  describe('renderSms', () => {
    it('should interpolate plain SMS text', async () => {
      const context: RenderContext & { personalisation: Record<string, string> } = {
        template: {
          id: 'template-1',
          name: 'SMS',
          type: 'sms',
          body: 'Hi {{name}}, your code is {{code}}',
          active: true,
        },
        personalisation: { name: 'John', code: '123456' },
      }

      const result = await renderer.renderSms(context)

      expect(result.body).toBe('Hi John, your code is 123456')
    })

    it('should not compile SMS text as MJML', async () => {
      const context: RenderContext & { personalisation: Record<string, string> } = {
        template: {
          id: 'template-1',
          name: 'SMS MJML Text',
          type: 'sms',
          body: '<mjml><mj-body><mj-text>{{name}}</mj-text></mj-body></mjml>',
          active: true,
        },
        personalisation: { name: 'John' },
      }

      const result = await renderer.renderSms(context)

      expect(result.body).toBe('<mjml><mj-body><mj-text>John</mj-text></mj-body></mjml>')
    })
  })

  describe('name property', () => {
    it('should have name "mjml"', () => {
      expect(renderer.name).toBe('mjml')
    })
  })
})
