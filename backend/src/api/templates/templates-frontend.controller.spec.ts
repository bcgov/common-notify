import { Test, TestingModule } from '@nestjs/testing'
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import type { CanActivate } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { vi } from 'vitest'
import { TemplatesFrontendController } from './templates-frontend.controller'
import { TemplatesService } from './templates.service'
import { CreateTemplateDto } from './schemas/create-template.dto'
import { UpdateTemplateDto } from './schemas/update-template.dto'
import { TenantsService } from '../admin/tenants/tenants.service'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { TemplateEngine } from '../../enum/template-engine.enum'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { CstarApiClient } from '../../services/cstar/cstar-api.client'
import { CstarRole } from '../../enum/cstar-role.enum'

// Keep the frontend role guard real while supplying an already authenticated JWT user.
vi.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class {
      canActivate() {
        return true
      }
    },
}))

describe('template preview frontend permissions', () => {
  const tenant = { id: 'tenant-a', externalId: 'external-a' }
  const tenants = { findByExternalId: vi.fn().mockResolvedValue(tenant) }
  const cstar = {
    getUserTenants: vi.fn().mockResolvedValue([{ id: 'external-a' }]),
    getUserRoles: vi.fn(),
  }
  const config = {
    getOrThrow: (key: string) =>
      key === 'auth.notifyClientId' ? 'notify' : 'https://issuer.example',
  }

  function context(
    method: 'getPreviewData' | 'savePreviewData' | 'previewTemplate',
  ): ExecutionContext {
    const request = {
      headers: { 'x-tenant-id': 'external-a', authorization: 'Bearer test' },
      user: { azp: 'notify', iss: 'https://issuer.example', idir_user_guid: 'viewer' },
    }
    return {
      getHandler: () => TemplatesFrontendController.prototype[method],
      getClass: () => TemplatesFrontendController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext
  }

  function guard() {
    return new NotifyFrontendRoleGuard(
      new Reflector(),
      config as unknown as ConfigService,
      tenants as unknown as TenantsService,
      cstar as unknown as CstarApiClient,
    )
  }

  it('allows viewers to read saved values and render', async () => {
    cstar.getUserRoles.mockResolvedValue([CstarRole.NOTIFY_VIEWER])
    await expect(guard().canActivate(context('getPreviewData'))).resolves.toBe(true)
    await expect(guard().canActivate(context('previewTemplate'))).resolves.toBe(true)
  })

  it('rejects viewer saves with 403', async () => {
    cstar.getUserRoles.mockResolvedValue([CstarRole.NOTIFY_VIEWER])
    const error = await guard()
      .canActivate(context('savePreviewData'))
      .catch((error: unknown) => error)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect((error as ForbiddenException).getStatus()).toBe(403)
  })

  it.each([CstarRole.NOTIFY_TEMPLATE_EDITOR, CstarRole.NOTIFY_OPERATIONS_ADMIN])(
    'allows %s to save shared values',
    async (role) => {
      cstar.getUserRoles.mockResolvedValue([role])
      await expect(guard().canActivate(context('savePreviewData'))).resolves.toBe(true)
    },
  )
})

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
          bearerWithClaims({
            preferred_username: 'guid@azureidir',
            display_name: 'Falk, Barrett CITZ:EX',
            given_name: 'Barrett',
            family_name: 'Falk',
          }),
        ),
        createDto,
      )

      expect(mockTemplatesService.createTemplate).toHaveBeenCalledWith(
        tenantId,
        createDto,
        'guid@azureidir',
        'Barrett Falk',
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
          bearerWithClaims({
            preferred_username: 'guid@azureidir',
            display_name: 'Falk, Barrett CITZ:EX',
            given_name: 'Barrett',
            family_name: 'Falk',
          }),
        ),
        templateId,
        updateDto,
      )

      expect(mockTemplatesService.updateTemplate).toHaveBeenCalledWith(
        tenantId,
        templateId,
        updateDto,
        'guid@azureidir',
        'Barrett Falk',
      )
    })
  })
})
