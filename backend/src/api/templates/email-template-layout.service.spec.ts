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
    findByIdIfApproved: vi.fn(),
    getDefault: vi.fn().mockResolvedValue({ id: 'default-logo' }),
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

  it.each([null, { emailLogoId: null }])(
    'uses the default for missing tenant logo settings: %s',
    async (settings) => {
      vi.mocked(tenantSettingsService.findByTenantId).mockResolvedValue(settings as any)
      const result = await service.apply(template, rendered)
      expect(result.bodyType).toBe('html')
      expect(result.body).toContain('width="180"')
      expect(result.body).toContain('width:180px;max-width:100%;height:auto;')
      expect(result.body).toContain('alt="Government of British Columbia"')
      expect(emailLogoService.buildPublicImageUrl).toHaveBeenCalledWith('default-logo')
    },
  )

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
          '<img src="https://gateway.example.test/logos/logo-id/image" width="180" alt="Government of British Columbia" style="display:block;width:180px;max-width:100%;height:auto;border:0;margin:0 0 24px 0;font-family:Arial,sans-serif;font-size:16px;color:#003366;">\n' +
          '<p>Hello <strong>Ada</strong></p>\n',
        bodyType: 'html',
      })
      expect(tenantSettingsService.findByTenantId).toHaveBeenCalledWith('tenant-id')
      expect(emailLogoService.buildPublicImageUrl).toHaveBeenCalledWith('logo-id')
    },
  )

  it('inserts the selected logo inside the MJML body', async () => {
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
    expect(result.body).toBe(
      '<!doctype html><html><body>\n<img src="https://gateway.example.test/logos/logo-id/image" width="180" alt="Government of British Columbia" style="display:block;width:180px;max-width:100%;height:auto;border:0;margin:0 0 24px 0;font-family:Arial,sans-serif;font-size:16px;color:#003366;">Hello</body></html>',
    )
  })

  it('renders an escaped ministry title next to the selected logo only when enabled', async () => {
    vi.mocked(tenantSettingsService.findByTenantId).mockResolvedValue({
      emailLogoId: 'ministry',
      useCustomEmailHeader: true,
    } as any)
    vi.mocked(emailLogoService.findByIdIfApproved).mockResolvedValue({
      displayTitle: 'Agriculture & Food <AF>',
    } as any)
    const result = await service.apply(template, rendered)
    expect(emailLogoService.findByIdIfApproved).toHaveBeenCalledWith('ministry')
    expect(result.body).toContain('role="presentation"')
    expect(result.body).toContain('Agriculture &amp; Food &lt;AF&gt;')
    expect(result.body).not.toContain('Agriculture & Food <AF>')
    expect(result.body).toContain('<p>Hello <strong>Ada</strong></p>')
    vi.mocked(tenantSettingsService.findByTenantId).mockResolvedValue({
      emailLogoId: 'ministry',
      useCustomEmailHeader: false,
    } as any)
    const logoOnly = await service.apply(template, rendered)
    expect(logoOnly.body).not.toContain('role="presentation"')
  })

  it('does not brand SMS', async () => {
    await expect(
      service.apply({ ...template, channelCode: NotificationChannel.SMS }, rendered),
    ).resolves.toBe(rendered)
    expect(emailLogoService.getDefault).not.toHaveBeenCalled()
  })
})
