import { Test, TestingModule } from '@nestjs/testing'
import type { CanActivate } from '@nestjs/common'
import { vi } from 'vitest'
import { TemplatesFrontendController } from './templates-frontend.controller'
import { TemplatesService } from './templates.service'
import { CreateTemplateDto } from './schemas/create-template.dto'
import { UpdateTemplateDto } from './schemas/update-template.dto'
import { TenantsService } from '../admin/tenants/tenants.service'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { TemplateEngine } from '../../enum/template-engine.enum'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'

describe('TemplatesFrontendController', () => {
  let controller: TemplatesFrontendController

  const tenantId = 'tenant-uuid-1'
  const templateId = 'template-uuid-1'

  const mockTemplatesService = {
    getPreviousVersion: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
  }

  const mockAuthGuard: CanActivate = { canActivate: () => true }

  const bearerWithClaims = (claims: Record<string, unknown>) => ({
    authorization: `Bearer h.${Buffer.from(JSON.stringify(claims)).toString('base64')}.s`,
  })

  const createMockRequest = (headers: Record<string, string> = {}) =>
    ({ tenant: { id: tenantId, name: 'Test Tenant' }, headers }) as any

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplatesFrontendController],
      providers: [
        { provide: TemplatesService, useValue: mockTemplatesService },
        { provide: TenantsService, useValue: { findByExternalId: vi.fn() } },
      ],
    })
      .overrideGuard(NotifyFrontendRoleGuard)
      .useValue(mockAuthGuard)
      .compile()

    controller = module.get<TemplatesFrontendController>(TemplatesFrontendController)
  })

  describe('getPreviousVersion', () => {
    it("should look up the previous version within the caller's tenant", async () => {
      const previous = { version: 1, name: 'Welcome', body: 'Hello' }
      mockTemplatesService.getPreviousVersion.mockResolvedValue(previous)

      const result = await controller.getPreviousVersion(createMockRequest(), templateId)

      expect(result).toEqual(previous)
      expect(mockTemplatesService.getPreviousVersion).toHaveBeenCalledWith(tenantId, templateId)
    })
  })

  describe('createTemplate', () => {
    const createDto: CreateTemplateDto = {
      name: 'Welcome',
      channelCode: NotificationChannel.EMAIL,
      body: 'Hello',
      engineCode: TemplateEngine.HANDLEBARS,
    }

    it('should pass the stable user id and the display name from the token', async () => {
      await controller.createTemplate(
        createMockRequest(
          bearerWithClaims({ preferred_username: 'guid@azureidir', display_name: 'Falk, Barrett' }),
        ),
        createDto,
      )

      expect(mockTemplatesService.createTemplate).toHaveBeenCalledWith(
        tenantId,
        createDto,
        'guid@azureidir',
        'Falk, Barrett',
      )
    })

    it('should pass a null name when the token carries none', async () => {
      await controller.createTemplate(
        createMockRequest(bearerWithClaims({ preferred_username: 'guid@azureidir' })),
        createDto,
      )

      expect(mockTemplatesService.createTemplate).toHaveBeenCalledWith(
        tenantId,
        createDto,
        'guid@azureidir',
        null,
      )
    })
  })

  describe('updateTemplate', () => {
    const updateDto: UpdateTemplateDto = { body: 'Hello again' }

    it('should pass the stable user id and the display name from the token', async () => {
      await controller.updateTemplate(
        createMockRequest(
          bearerWithClaims({ preferred_username: 'guid@azureidir', display_name: 'Falk, Barrett' }),
        ),
        templateId,
        updateDto,
      )

      expect(mockTemplatesService.updateTemplate).toHaveBeenCalledWith(
        tenantId,
        templateId,
        updateDto,
        'guid@azureidir',
        'Falk, Barrett',
      )
    })
  })
})
