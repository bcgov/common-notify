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
 * string is what is under test: `channel` arrives as a string or, repeated, as an array, and the
 * DTO's transforms only run inside that pipe.
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

  it('passes no channels when the parameter is absent', async () => {
    await request(app.getHttpServer()).get(url).query({ page: '2', search: 'parks' }).expect(200)

    expect(getAllTenantsUsage).toHaveBeenCalledWith({
      page: 2,
      limit: undefined,
      search: 'parks',
      channels: undefined,
    })
  })

  it('accepts a single channel, in any case', async () => {
    await request(app.getHttpServer()).get(`${url}?channel=sms`).expect(200)

    expect(getAllTenantsUsage).toHaveBeenCalledWith(expect.objectContaining({ channels: ['SMS'] }))
  })

  it('accepts comma-separated channels', async () => {
    await request(app.getHttpServer()).get(`${url}?channel=EMAIL,SMS`).expect(200)

    expect(getAllTenantsUsage).toHaveBeenCalledWith(
      expect.objectContaining({ channels: ['EMAIL', 'SMS'] }),
    )
  })

  it('accepts a repeated channel parameter', async () => {
    await request(app.getHttpServer()).get(`${url}?channel=EMAIL&channel=SMS`).expect(200)

    expect(getAllTenantsUsage).toHaveBeenCalledWith(
      expect.objectContaining({ channels: ['EMAIL', 'SMS'] }),
    )
  })

  it('rejects an unknown channel instead of returning every channel', async () => {
    const response = await request(app.getHttpServer()).get(`${url}?channel=EMAIL,FAX`).expect(400)

    expect(JSON.stringify(response.body.message)).toContain('channel')
    expect(getAllTenantsUsage).not.toHaveBeenCalled()
  })

  it('rejects a channel it cannot read as a list', async () => {
    await request(app.getHttpServer()).get(`${url}?channel[a]=EMAIL`).expect(400)

    expect(getAllTenantsUsage).not.toHaveBeenCalled()
  })

  it('rejects a page that is not a whole number', async () => {
    await request(app.getHttpServer()).get(`${url}?page=two`).expect(400)

    expect(getAllTenantsUsage).not.toHaveBeenCalled()
  })
})
