import { NotificationChannel } from '../../enum/notification-channel.enum'
import { TemplateEngine } from '../../enum/template-engine.enum'
import { EmailLogoService } from '../email-logo/email-logo.service'
import { EmailLogoStorageService } from '../email-logo/email-logo-storage.service'
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service'
import { Template } from './entities/template.entity'
import { EmailTemplateLayoutService, RenderedEmailContent } from './email-template-layout.service'

describe('EmailTemplateLayoutService', () => {
  const tenantSettingsService = {
    findByTenantId: vi.fn(),
  } as unknown as TenantSettingsService
  const emailLogoService = {
    findByIdIfApproved: vi.fn(),
  } as unknown as EmailLogoService
  const emailLogoStorage = {
    head: vi.fn(),
    download: vi.fn(),
  } as unknown as EmailLogoStorageService
  const service = new EmailTemplateLayoutService(
    tenantSettingsService,
    emailLogoService,
    emailLogoStorage,
  )

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
    vi.mocked(emailLogoService.findByIdIfApproved).mockResolvedValue({
      id: 'logo-id',
      name: 'Primary logo',
      fileKey: 'logos/logo.png',
    } as any)
    vi.mocked(emailLogoStorage.head).mockResolvedValue({ contentType: 'image/png' })
    vi.mocked(emailLogoStorage.download).mockResolvedValue(Buffer.from('png'))
  })

  it('leaves output unchanged when the tenant has no selected logo', async () => {
    vi.mocked(tenantSettingsService.findByTenantId).mockResolvedValue({
      emailLogoId: null,
    } as any)

    await expect(service.apply(template, rendered)).resolves.toBe(rendered)
    expect(emailLogoService.findByIdIfApproved).not.toHaveBeenCalled()
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
          '<img src="cid:email-logo-logo-id" alt="Primary logo">\n' +
          '<p>Hello <strong>Ada</strong></p>\n',
        bodyType: 'html',
        attachments: [
          {
            filename: 'logo.png',
            content: Buffer.from('png'),
            contentType: 'image/png',
            sendingMethod: 'attach',
            contentId: 'email-logo-logo-id',
            disposition: 'inline',
          },
        ],
      })
      expect(tenantSettingsService.findByTenantId).toHaveBeenCalledWith('tenant-id')
      expect(emailLogoService.findByIdIfApproved).toHaveBeenCalledWith('logo-id')
      expect(emailLogoStorage.head).toHaveBeenCalledWith('logos/logo.png')
      expect(emailLogoStorage.download).toHaveBeenCalledWith('logos/logo.png')
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
    expect(emailLogoService.findByIdIfApproved).not.toHaveBeenCalled()
  })
})
