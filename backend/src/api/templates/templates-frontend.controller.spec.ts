import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { TemplatesFrontendController } from './templates-frontend.controller'
import { TenantsService } from '../admin/tenants/tenants.service'
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
