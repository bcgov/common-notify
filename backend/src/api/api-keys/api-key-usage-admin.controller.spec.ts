import { Test } from '@nestjs/testing'
import { ValidationPipe, VersioningType } from '@nestjs/common'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ApiKeyUsageAdminController } from './api-key-usage-admin.controller'
import { ApiKeyUsageService } from './api-key-usage.service'
import { NotifyAdminGuard } from '../../common/guards/notify-admin.guard'
import { TenantsService } from '../admin/tenants/tenants.service'

/**
 * Driven over HTTP, through the global ValidationPipe as app.ts installs it, because the query
 * string is what is under test and the DTO's transforms only run inside that pipe.
 */
describe('ApiKeyUsageAdminController GET /frontend/admin/api-key-usage', () => {
  let app: INestApplication
  let getAllTenantsUsage: ReturnType<typeof vi.fn>
  let getAdminUsageSummary: ReturnType<typeof vi.fn>
  let listNotifyTenants: ReturnType<typeof vi.fn>
  let setSending: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    getAllTenantsUsage = vi
      .fn()
      .mockResolvedValue({ data: [], count: 0, page: 1, limit: 15, totalPages: 0 })
    setSending = vi.fn().mockImplementation((_id, enabled: boolean) => Promise.resolve(enabled))
    listNotifyTenants = vi.fn().mockResolvedValue([{ id: 't-1', name: 'Parks' }])
    getAdminUsageSummary = vi
      .fn()
      .mockResolvedValue({ tenants: 42, sentThisFiscalYear: 30, disabled: 0 })

    const module = await Test.createTestingModule({
      controllers: [ApiKeyUsageAdminController],
      providers: [
        {
          provide: ApiKeyUsageService,
          useValue: { getAllTenantsUsage, getAdminUsageSummary, listNotifyTenants },
        },
        { provide: TenantsService, useValue: { setSending } },
      ],
    })
      .overrideGuard(NotifyAdminGuard)
      .useValue({ canActivate: () => true })
      .compile()

    app = module.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI })
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    )
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  const url = '/v1/frontend/admin/api-key-usage'

  it('passes the page, search and no filters when none are given', async () => {
    await request(app.getHttpServer())
      .get(url)
      .query({ page: '2', limit: '30', search: 'parks' })
      .expect(200)

    expect(getAllTenantsUsage).toHaveBeenCalledWith(
      { page: 2, limit: 30, skip: 30, filters: [], sorts: [] },
      'parks',
    )
  })

  it('parses a channel filter in the shared field:operator:value form', async () => {
    await request(app.getHttpServer()).get(`${url}?filter=channel:in:EMAIL|SMS`).expect(200)

    expect(getAllTenantsUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ field: 'channel', operator: 'in', value: ['EMAIL', 'SMS'] }],
      }),
      undefined,
    )
  })

  it.each([
    ['a field that cannot be filtered on', 'tenantName:eq:Parks'],
    ['an operator the field does not allow', 'channel:like:SMS'],
  ])('rejects %s', async (_, filter) => {
    await request(app.getHttpServer()).get(url).query({ filter }).expect(400)

    expect(getAllTenantsUsage).not.toHaveBeenCalled()
  })

  it('returns the tenant summary from /summary, not the paged list', async () => {
    const response = await request(app.getHttpServer()).get(`${url}/summary`).expect(200)

    expect(response.body).toEqual({ tenants: 42, sentThisFiscalYear: 30, disabled: 0 })
    expect(getAllTenantsUsage).not.toHaveBeenCalled()
  })

  it('parses a sending status filter', async () => {
    await request(app.getHttpServer()).get(`${url}?filter=status:in:disabled`).expect(200)

    expect(getAllTenantsUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ field: 'status', operator: 'in', value: ['disabled'] }],
      }),
      undefined,
    )
  })

  it('passes a sort on a usage total, and rejects one that is not sortable', async () => {
    await request(app.getHttpServer()).get(url).query({ sort: '-usedThisYear' }).expect(200)
    expect(getAllTenantsUsage).toHaveBeenCalledWith(
      expect.objectContaining({ sorts: [{ field: 'usedThisYear', direction: 'DESC' }] }),
      undefined,
    )

    await request(app.getHttpServer()).get(url).query({ sort: 'tenantName' }).expect(400)
  })

  it('lists the tenants for the search from /tenants', async () => {
    const response = await request(app.getHttpServer()).get(`${url}/tenants`).expect(200)

    expect(response.body).toEqual([{ id: 't-1', name: 'Parks' }])
  })

  it('rejects a page that is not a whole number', async () => {
    await request(app.getHttpServer()).get(`${url}?page=two`).expect(400)

    expect(getAllTenantsUsage).not.toHaveBeenCalled()
  })

  describe('PATCH tenants/:tenantId/sending', () => {
    const tenantId = '0b9f6d0c-1d7e-4c55-9d2a-5f3f4a1b2c3d'
    const sending = `${url}/tenants/${tenantId}/sending`

    it('disables sending with a trimmed reason', async () => {
      const response = await request(app.getHttpServer())
        .patch(sending)
        .send({ enabled: false, reason: '  Unpaid invoice  ' })
        .expect(200)

      expect(response.body).toEqual({ sendingEnabled: false })
      expect(setSending).toHaveBeenCalledWith(
        tenantId,
        false,
        'Unpaid invoice',
        expect.objectContaining({ id: expect.any(String) }),
      )
    })

    it('enables sending without a reason', async () => {
      await request(app.getHttpServer()).patch(sending).send({ enabled: true }).expect(200)

      expect(setSending).toHaveBeenCalledWith(tenantId, true, undefined, expect.anything())
    })

    it.each([
      ['no reason', { enabled: false }],
      ['a blank reason', { enabled: false, reason: '   ' }],
      ['a reason over 500 characters', { enabled: false, reason: 'x'.repeat(501) }],
      ['no enabled flag', { reason: 'Billing' }],
    ])('rejects disabling with %s', async (_, body) => {
      await request(app.getHttpServer()).patch(sending).send(body).expect(400)

      expect(setSending).not.toHaveBeenCalled()
    })

    it('rejects a tenant id that is not a UUID', async () => {
      await request(app.getHttpServer())
        .patch(`${url}/tenants/not-a-uuid/sending`)
        .send({ enabled: true })
        .expect(400)
    })
  })
})
