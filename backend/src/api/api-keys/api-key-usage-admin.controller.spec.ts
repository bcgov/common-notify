import { Test } from '@nestjs/testing'
import { ValidationPipe, VersioningType } from '@nestjs/common'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ApiKeyUsageAdminController } from './api-key-usage-admin.controller'
import { ApiKeyUsageService } from './api-key-usage.service'
import { NotifyAdminGuard } from '../../common/guards/notify-admin.guard'

/**
 * Driven over HTTP, through the global ValidationPipe as app.ts installs it, because the query
 * string is what is under test and the DTO's transforms only run inside that pipe.
 */
describe('ApiKeyUsageAdminController GET /frontend/admin/api-key-usage', () => {
  let app: INestApplication
  let getAllTenantsUsage: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    getAllTenantsUsage = vi
      .fn()
      .mockResolvedValue({ data: [], count: 0, page: 1, limit: 15, totalPages: 0 })

    const module = await Test.createTestingModule({
      controllers: [ApiKeyUsageAdminController],
      providers: [{ provide: ApiKeyUsageService, useValue: { getAllTenantsUsage } }],
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

  it('rejects a page that is not a whole number', async () => {
    await request(app.getHttpServer()).get(`${url}?page=two`).expect(400)

    expect(getAllTenantsUsage).not.toHaveBeenCalled()
  })
})
