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
    buildEmailImageUrl: vi.fn(),
    findByIdIfApproved: vi.fn(),
    getDefault: vi.fn(),
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
  const logoImg =
    '<img src="https://gateway.example.test/logos/logo-id/image?format=email" alt="Agriculture" ' +
    'height="80" style="height:80px;width:auto;border:0;display:block;">'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(emailLogoService.buildEmailImageUrl).mockReturnValue(
      'https://gateway.example.test/logos/logo-id/image?format=email',
    )
    vi.mocked(emailLogoService.getDefault).mockResolvedValue({ id: 'default-logo' } as any)
    vi.mocked(emailLogoService.findByIdIfApproved).mockResolvedValue({
      displayTitle: 'Agriculture',
    } as any)
  })

  describe("with the tenant's header", () => {
    it.each([null, { emailLogoId: null }])(
      'uses the default logo for missing tenant logo settings: %s',
      async (settings) => {
        vi.mocked(tenantSettingsService.findByTenantId).mockResolvedValue(settings as any)
        const result = await service.apply(template, rendered)
        expect(result.bodyType).toBe('html')
        expect(emailLogoService.buildEmailImageUrl).toHaveBeenCalledWith('default-logo')
      },
    )

    it.each([TemplateEngine.HANDLEBARS, TemplateEngine.MUSTACHE, TemplateEngine.LEGACY_GC_NOTIFY])(
      'puts the selected logo alone above the body for the %s engine',
      async (engineCode) => {
        vi.mocked(tenantSettingsService.findByTenantId).mockResolvedValue({
          emailLogoId: 'logo-id',
        } as any)

        const result = await service.apply({ ...template, engineCode } as Template, rendered)

        expect(result).toEqual({
          subject: rendered.subject,
          body:
            '<div style="background-color: #ffffff; max-width: 600px;">' +
            '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
            'style="width:100%;border-collapse:collapse;"><tr>' +
            '<td style="vertical-align:middle;padding-bottom:0px;border-bottom:1px solid #d8d8d8;' +
            `width:1%;white-space:nowrap;padding-right:16px;">${logoImg}</td></tr>` +
            '<tr><td colspan="1" height="28" style="height:28px;line-height:28px;font-size:0;">&nbsp;</td></tr>' +
            '</table></div>\n' +
            '<p>Hello <strong>Ada</strong></p>\n',
          bodyType: 'html',
        })
        expect(tenantSettingsService.findByTenantId).toHaveBeenCalledWith('tenant-id')
        expect(emailLogoService.buildEmailImageUrl).toHaveBeenCalledWith('logo-id')
      },
    )

    it('shows neither a title nor alt text when the logo has no display title', async () => {
      vi.mocked(tenantSettingsService.findByTenantId).mockResolvedValue({
        emailLogoId: 'logo-id',
        useCustomEmailHeader: true,
      } as any)
      vi.mocked(emailLogoService.findByIdIfApproved).mockResolvedValue({
        displayTitle: null,
      } as any)

      const result = await service.apply(template, rendered)

      expect(result.body).toContain('alt=""')
      expect(result.body).not.toContain('border-left')
    })

    it("shows the logo's escaped display title beside it only when enabled", async () => {
      vi.mocked(tenantSettingsService.findByTenantId).mockResolvedValue({
        emailLogoId: 'ministry',
        useCustomEmailHeader: true,
      } as any)
      vi.mocked(emailLogoService.findByIdIfApproved).mockResolvedValue({
        displayTitle: 'Agriculture & Food <AF>',
      } as any)

      const result = await service.apply(template, rendered)

      expect(emailLogoService.findByIdIfApproved).toHaveBeenCalledWith('ministry')
      expect(result.body).toContain(
        '<div style="border-left:1px solid #d8d8d8;padding-left:16px;">Agriculture &amp; Food &lt;AF&gt;</div>',
      )
      // The title says what the logo shows, so the image is decorative.
      expect(result.body).toContain('alt=""')

      vi.mocked(tenantSettingsService.findByTenantId).mockResolvedValue({
        emailLogoId: 'ministry',
        useCustomEmailHeader: false,
      } as any)
      const logoOnly = await service.apply(template, rendered)
      expect(logoOnly.body).not.toContain('border-left')
    })
  })

  describe('with a header override', () => {
    it("uses the override's logo without consulting the tenant", async () => {
      const result = await service.apply(template, rendered, {
        logoId: 'event-logo-id',
        title: null,
      })

      expect(emailLogoService.buildEmailImageUrl).toHaveBeenCalledWith('event-logo-id')
      expect(tenantSettingsService.findByTenantId).not.toHaveBeenCalled()
      expect(result.body).not.toContain('border-left')
      expect(result.bodyType).toBe('html')
    })

    it('puts an escaped title beside the logo', async () => {
      const result = await service.apply(template, rendered, {
        logoId: 'event-logo-id',
        title: 'Permits & Licensing',
      })

      // Escaped, because the title is operator-entered text going into an HTML email.
      expect(result.body).toContain('Permits &amp; Licensing')
      expect(result.body).toContain('<p>Hello <strong>Ada</strong></p>')
    })

    it('ignores the tenant title setting: the override decides whether there is a title', async () => {
      vi.mocked(tenantSettingsService.findByTenantId).mockResolvedValue({
        emailLogoId: 'tenant-logo',
        useCustomEmailHeader: true,
      } as any)

      const result = await service.apply(template, rendered, { logoId: null, title: null })

      expect(result.body).not.toContain('border-left')
    })

    it.each([
      [{ emailLogoId: 'tenant-logo' }, 'tenant-logo'],
      [null, 'default-logo'],
    ])(
      "inherits the tenant's logo, or the default, when it names none: %s",
      async (settings, expectedLogoId) => {
        vi.mocked(tenantSettingsService.findByTenantId).mockResolvedValue(settings as any)

        const result = await service.apply(template, rendered, {
          logoId: null,
          title: 'Permits',
        })

        expect(emailLogoService.buildEmailImageUrl).toHaveBeenCalledWith(expectedLogoId)
        expect(result.body).toContain('Permits')
      },
    )
  })

  describe('header style', () => {
    beforeEach(() => {
      vi.mocked(tenantSettingsService.findByTenantId).mockResolvedValue({
        emailLogoId: 'logo-id',
        useCustomEmailHeader: true,
      } as any)
    })

    it('sizes and spaces the header the way the preview does', async () => {
      const result = await service.apply(template, rendered)

      // Left unconstrained, a logo arrives at whatever size it was uploaded at. The preview caps
      // its height, so the email has to as well - as an attribute and a style, since mail
      // clients disagree about which they honour.
      expect(result.body).toContain('height="80"')
      expect(result.body).toContain('height:80px;width:auto;')
      // The preview's title is not bold, and the rule between the halves is 16px out either side.
      expect(result.body).not.toContain('font-weight:bold')
      expect(result.body).toContain('padding-right:16px')
      expect(result.body).toContain('border-left:1px solid #d8d8d8;padding-left:16px;')
    })

    it('sits closer to its own rule than the message below it does', async () => {
      const result = await service.apply(template, rendered)

      // Nothing is added above the rule: the logos carry their own whitespace, and padding here
      // stacks on top of that.
      expect(result.body).toContain('padding-bottom:0px;border-bottom:1px solid #d8d8d8;')
      // A spacer row rather than a table margin, which Outlook puts above the rule instead.
      expect(result.body).not.toContain('margin-bottom')
      expect(result.body).toContain(
        '<tr><td colspan="2" height="28" style="height:28px;line-height:28px;font-size:0;">&nbsp;</td></tr>',
      )
    })

    it('draws the dividing rule on the title rather than on its cell', async () => {
      const result = await service.apply(template, rendered)

      // On the cell the rule would run the full height of the row. On the text it is only as
      // tall as the title, which is what the preview shows.
      expect(result.body).not.toMatch(/<td[^>]*border-left/)
    })

    it('is left aligned rather than centred', async () => {
      const result = await service.apply(template, rendered)

      expect(result.body).not.toContain('margin: 0 auto')
    })
  })

  it('inserts the header inside the body of a complete document such as MJML output', async () => {
    vi.mocked(tenantSettingsService.findByTenantId).mockResolvedValue({
      emailLogoId: 'logo-id',
    } as any)
    const mjmlOutput: RenderedEmailContent = {
      subject: 'Hello',
      body: '<!doctype html><html><body>Hello</body></html>',
      bodyType: 'html',
    }

    const result = await service.apply(
      { ...template, engineCode: TemplateEngine.MJML } as Template,
      mjmlOutput,
    )

    expect(result.body).toMatch(
      /^<!doctype html><html><body>\n<div style="background-color: #ffffff; max-width: 600px;"><table[^]*<\/table><\/div>Hello<\/body><\/html>$/,
    )
  })

  it('does not brand SMS', async () => {
    await expect(
      service.apply({ ...template, channelCode: NotificationChannel.SMS }, rendered),
    ).resolves.toBe(rendered)
    expect(emailLogoService.getDefault).not.toHaveBeenCalled()
  })
})
