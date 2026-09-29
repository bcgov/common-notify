import { NotificationChannel } from '../../enum/notification-channel.enum'
import { TemplateEngine } from '../../enum/template-engine.enum'
import { EmailLogoService } from '../email-logo/email-logo.service'
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service'
import { Template } from './entities/template.entity'
import { EmailTemplateLayoutService, RenderedEmailContent } from './email-template-layout.service'

describe('EmailTemplateLayoutService', () => {
  const tenantSettingsService = {
    findByTenantId: vi.fn(),
  } as unknown as TenantSettingsService
  const emailLogoService = {
    buildPublicImageUrl: vi.fn(),
  } as unknown as EmailLogoService
  const service = new EmailTemplateLayoutService(tenantSettingsService, emailLogoService)

  const template = {
    id: 'template-id',
    tenantId: 'tenant-id',
    channelCode: NotificationChannel.EMAIL,
    engineCode: TemplateEngine.HANDLEBARS,
  } as Template
  const rendered: RenderedEmailContent = {
    subject: 'Hello',
    body: 'Hello **Ada**',
    bodyType: 'markdown',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(emailLogoService.buildPublicImageUrl).mockReturnValue(
      'https://gateway.example.test/logos/logo-id/image',
    )
  })

  it('leaves output unchanged when the tenant has no selected logo', async () => {
    vi.mocked(tenantSettingsService.findByTenantId).mockResolvedValue({
      emailLogoId: null,
    } as any)

    await expect(service.apply(template, rendered)).resolves.toBe(rendered)
    expect(emailLogoService.buildPublicImageUrl).not.toHaveBeenCalled()
  })

  it.each([TemplateEngine.HANDLEBARS, TemplateEngine.MUSTACHE, TemplateEngine.LEGACY_GC_NOTIFY])(
    'injects the selected logo for the %s engine',
    async (engineCode) => {
      vi.mocked(tenantSettingsService.findByTenantId).mockResolvedValue({
        emailLogoId: 'logo-id',
      } as any)

      const result = await service.apply({ ...template, engineCode } as Template, rendered)

      expect(result).toEqual({
        subject: rendered.subject,
        body:
          '<img src="https://gateway.example.test/logos/logo-id/image" alt="">\n' +
          '<p>Hello <strong>Ada</strong></p>\n',
        bodyType: 'html',
      })
      expect(tenantSettingsService.findByTenantId).toHaveBeenCalledWith('tenant-id')
      expect(emailLogoService.buildPublicImageUrl).toHaveBeenCalledWith('logo-id')
    },
  )

  describe('with a header override', () => {
    it("uses the override's logo instead of the tenant's", async () => {
      const result = await service.apply(template, rendered, {
        logoId: 'event-logo-id',
        title: null,
      })

      expect(emailLogoService.buildPublicImageUrl).toHaveBeenCalledWith('event-logo-id')
      // Never consulted: the override is the whole header, not a partial one.
      expect(tenantSettingsService.findByTenantId).not.toHaveBeenCalled()
      expect(result.body).toContain('<img src="https://gateway.example.test/logos/logo-id/image"')
      expect(result.bodyType).toBe('html')
    })

    it('puts a title beside the logo', async () => {
      const result = await service.apply(template, rendered, {
        logoId: 'event-logo-id',
        title: 'Permits & Licensing',
      })

      expect(result.body).toContain('<table role="presentation"')
      expect(result.body).toContain('<img src="https://gateway.example.test/logos/logo-id/image"')
      // Escaped, because the title is operator-entered text going into an HTML email.
      expect(result.body).toContain('Permits &amp; Licensing')
      expect(result.body).toContain('<p>Hello <strong>Ada</strong></p>')
    })

    it('sizes and spaces the header the way the preview does', async () => {
      const result = await service.apply(template, rendered, {
        logoId: 'event-logo-id',
        title: 'Permits',
      })

      // Left unconstrained, a logo arrives at whatever size it was uploaded at. The preview caps
      // its height, so the email has to as well - as an attribute and a style, since mail
      // clients disagree about which they honour.
      expect(result.body).toContain('height="72"')
      expect(result.body).toContain('height:72px;width:auto;')
      // The preview's title is not bold, and the rule between the halves is 16px out either side.
      expect(result.body).not.toContain('font-weight:bold')
      expect(result.body).toContain('padding-right:16px')
      expect(result.body).toContain('border-left:1px solid #d8d8d8;padding-left:16px;')
    })

    it('sits closer to its own rule than the message below it does', async () => {
      const result = await service.apply(template, rendered, {
        logoId: 'event-logo-id',
        title: 'Permits',
      })

      // The header and the message are two blocks, not one evenly spaced run - so the gap above
      // the rule is smaller than the gap below it. Nothing is added above it at all: the logo
      // SVGs carry their own whitespace, and padding here stacks on top of that.
      expect(result.body).toContain('padding-bottom:0px')
      expect(result.body).toContain('margin-bottom:28px')
    })

    it('draws the dividing rule on the title rather than on its cell', async () => {
      const result = await service.apply(template, rendered, {
        logoId: 'event-logo-id',
        title: 'Permits',
      })

      // On the cell the rule would run the full height of the row, down to the rule underneath
      // it. On the text it is only as tall as the title, which is what the preview shows.
      expect(result.body).toContain(
        '<div style="border-left:1px solid #d8d8d8;padding-left:16px;">Permits</div>',
      )
      expect(result.body).not.toMatch(/<td[^>]*border-left/)
    })

    it('drops the dividing rule when there is no logo to divide from', async () => {
      const result = await service.apply(template, rendered, { logoId: null, title: 'Permits' })

      expect(result.body).not.toContain('border-left')
    })

    it('renders a title on its own when there is no logo', async () => {
      const result = await service.apply(template, rendered, {
        logoId: null,
        title: 'Permits',
      })

      expect(emailLogoService.buildPublicImageUrl).not.toHaveBeenCalled()
      expect(result.body).toContain('Permits')
      expect(result.bodyType).toBe('html')
    })

    it('leaves output unchanged when the override is empty', async () => {
      // An event with useCustomHeader on but neither field set has nothing to add.
      await expect(service.apply(template, rendered, { logoId: null, title: null })).resolves.toBe(
        rendered,
      )
      expect(tenantSettingsService.findByTenantId).not.toHaveBeenCalled()
    })

    it('still leaves MJML alone', async () => {
      const mjml: RenderedEmailContent = {
        subject: 'Hello',
        body: '<!doctype html><html><body>Hello</body></html>',
        bodyType: 'html',
      }

      await expect(
        service.apply({ ...template, engineCode: TemplateEngine.MJML } as Template, mjml, {
          logoId: 'event-logo-id',
          title: 'Permits',
        }),
      ).resolves.toBe(mjml)
    })
  })

  it('leaves MJML output unchanged even when the tenant has a selected logo', async () => {
    vi.mocked(tenantSettingsService.findByTenantId).mockResolvedValue({
      emailLogoId: 'logo-id',
    } as any)
    const mjmlOutput: RenderedEmailContent = {
      subject: 'Hello',
      body: '<!doctype html><html><body>Hello</body></html>',
      bodyType: 'html',
    }

    await expect(
      service.apply({ ...template, engineCode: TemplateEngine.MJML } as Template, mjmlOutput),
    ).resolves.toBe(mjmlOutput)
    expect(tenantSettingsService.findByTenantId).not.toHaveBeenCalled()
    expect(emailLogoService.buildPublicImageUrl).not.toHaveBeenCalled()
  })
})
