import { Test } from '@nestjs/testing'
import { ValidationPipe, VersioningType } from '@nestjs/common'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminNotificationsController } from './admin-notifications.controller'
import { AdminNotificationsService } from './admin-notifications.service'
import { NotifyAdminGuard } from '../../../common/guards/notify-admin.guard'

/** Driven over HTTP through the global ValidationPipe, as app.ts installs it. */
describe('AdminNotificationsController', () => {
  let app: INestApplication
  const service = {
    list: vi.fn(),
    findOne: vi.fn(),
    listDeliveries: vi.fn(),
  }
  const url = '/v1/frontend/admin/notifications'
  const id = '0b9f6d0c-1d7e-4c55-9d2a-5f3f4a1b2c3d'

  beforeEach(async () => {
    vi.clearAllMocks()
    const page = { data: [], count: 0, page: 1, limit: 15, totalPages: 0 }
    service.list.mockResolvedValue(page)
    service.listDeliveries.mockResolvedValue(page)
    service.findOne.mockResolvedValue({ id })

    const module = await Test.createTestingModule({
      controllers: [AdminNotificationsController],
      providers: [{ provide: AdminNotificationsService, useValue: service }],
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

  it('passes the page, filters and tenant search to the list', async () => {
    await request(app.getHttpServer())
      .get(url)
      .query({ page: '2', limit: '30', search: 'parks', filter: 'status:in:failed' })
      .expect(200)

    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 30, filter: ['status:in:failed'] }),
      'parks',
    )
  })

  it('reads one request and its deliveries by id', async () => {
    await request(app.getHttpServer()).get(`${url}/${id}`).expect(200)
    expect(service.findOne).toHaveBeenCalledWith(id)

    await request(app.getHttpServer())
      .get(`${url}/${id}/deliveries`)
      .query({ page: '3' })
      .expect(200)
    expect(service.listDeliveries).toHaveBeenCalledWith(id, expect.objectContaining({ page: 3 }))
  })

  it('rejects an id that is not a UUID', async () => {
    await request(app.getHttpServer()).get(`${url}/not-a-uuid`).expect(400)
    await request(app.getHttpServer()).get(`${url}/not-a-uuid/deliveries`).expect(400)
    expect(service.findOne).not.toHaveBeenCalled()
  })
})
