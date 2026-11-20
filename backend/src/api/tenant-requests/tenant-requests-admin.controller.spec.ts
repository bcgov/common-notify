import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { TenantRequestsAdminController } from './tenant-requests-admin.controller'
import type { TenantRequestsService } from './tenant-requests.service'
import { ApproveTenantRequestDto } from './schemas/tenant-request.dto'
import { TenantRequestHandlerRegistry } from './tenant-request-handler.registry'
import type { TenantRequestHandler } from './tenant-request-handler'

describe('TenantRequestsAdminController', () => {
  const setup = () => {
    const service = {
      list: vi.fn().mockResolvedValue({ data: [], count: 0, page: 1, limit: 15, totalPages: 0 }),
      approve: vi.fn().mockResolvedValue({ id: 'request-1' }),
    }
    const controller = new TenantRequestsAdminController(
      service as unknown as TenantRequestsService,
    )
    return { controller, service }
  }
  const req = { headers: {} } as never

  it('lists by the status and type filters, and the tenant search', async () => {
    const { controller, service } = setup()

    await controller.list({
      page: 2,
      limit: 15,
      search: 'parks',
      filter: ['statusCode:in:pending|approved', 'requestTypeCode:eq:sms_number'],
    })

    expect(service.list).toHaveBeenCalledWith({
      statuses: ['pending', 'approved'],
      types: ['sms_number'],
      search: 'parks',
      page: 2,
      limit: 15,
    })
  })

  it("passes the admin's options to the workflow, or none", async () => {
    const { controller, service } = setup()

    await controller.approve(req, 'request-1', { options: { smsNumberId: 'number-1' } })
    await controller.approve(req, 'request-1', {})

    expect(service.approve.mock.calls.map((call) => call[1])).toEqual([
      { smsNumberId: 'number-1' },
      {},
    ])
  })

  it("keeps a type's options through the app's validation, which strips unknown fields", async () => {
    // As app.ts configures it.
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
    const metadata = { type: 'body' as const, metatype: ApproveTenantRequestDto }

    await expect(
      pipe.transform({ options: { smsNumberId: 'number-1', useDefaultNumber: false } }, metadata),
    ).resolves.toMatchObject({ options: { smsNumberId: 'number-1', useDefaultNumber: false } })
    await expect(pipe.transform({ options: 'number-1' }, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })
})

describe('TenantRequestHandlerRegistry', () => {
  it('finds a registered handler, and refuses an unknown type as a bad request', () => {
    const registry = new TenantRequestHandlerRegistry()
    const handler = { type: 'sms_number' } as TenantRequestHandler
    registry.register(handler)

    expect(registry.get('sms_number')).toBe(handler)
    expect(registry.find('priority_lane')).toBeUndefined()
    expect(() => registry.get('priority_lane')).toThrow(BadRequestException)
    expect(registry.all()).toEqual([handler])
  })
})
