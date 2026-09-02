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
