import { describe, expect, it, vi } from 'vitest'
import type { DataSource } from 'typeorm'
import { SmsNumberRequestsController } from './sms-number-requests.controller'
import type { SmsNumberRequestHandler } from './sms-number-request.handler'
import type { SmsNumbersService } from './sms-numbers.service'
import type { TenantRequestsService } from '../tenant-requests/tenant-requests.service'

describe('SmsNumberRequestsController', () => {
  const pending = { id: 'request-1', statusCode: 'pending' }
  const setup = (testEnvironment: boolean) => {
    const requests = {
      findLatestForTenant: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(pending),
      cancel: vi.fn().mockResolvedValue(pending),
      release: vi.fn().mockResolvedValue(pending),
      dismiss: vi.fn().mockResolvedValue(undefined),
    }
    const handler = {
      toSmsDto: vi.fn(async (_manager: unknown, request: unknown) =>
        request ? { ...request, phoneNumber: null, usesDefaultNumber: false } : null,
      ),
    }
    const numbers = {
      resolveSenderNumber: vi.fn().mockResolvedValue('+15814360804'),
      defaultNumberAssignable: vi.fn().mockReturnValue(testEnvironment),
    }
    const controller = new SmsNumberRequestsController(
      requests as unknown as TenantRequestsService,
      handler as unknown as SmsNumberRequestHandler,
      numbers as unknown as SmsNumbersService,
      { manager: {} } as unknown as DataSource,
    )
    return { controller, requests, numbers }
  }
  const req = { tenant: { id: 'tenant-1' }, headers: {} } as never

  it("returns the tenant's request with the number it sends from meanwhile", async () => {
    const { controller, requests, numbers } = setup(true)

    await expect(controller.getLatest(req)).resolves.toEqual({
      request: null,
      senderNumber: '+15814360804',
      testEnvironment: true,
    })
    expect(requests.findLatestForTenant).toHaveBeenCalledWith('tenant-1', 'sms_number')
    expect(numbers.resolveSenderNumber).toHaveBeenCalledWith('tenant-1')
  })

  it('reports prod as not a test environment', async () => {
    const { controller } = setup(false)

    await expect(controller.getLatest(req)).resolves.toMatchObject({ testEnvironment: false })
  })

  it('keeps cancel, release and dismiss to SMS number requests of the calling tenant', async () => {
    const { controller, requests } = setup(true)

    await expect(controller.create(req)).resolves.toMatchObject({ id: 'request-1' })
    expect(requests.create).toHaveBeenCalledWith('tenant-1', 'sms_number', expect.anything())
    await controller.cancel(req, 'request-1')
    expect(requests.cancel).toHaveBeenCalledWith(
      'tenant-1',
      'request-1',
      expect.anything(),
      'sms_number',
    )
    await controller.release(req, 'request-1')
    expect(requests.release).toHaveBeenCalledWith('request-1', expect.anything(), {
      tenantId: 'tenant-1',
      type: 'sms_number',
    })
    await expect(controller.dismiss(req, 'request-1')).resolves.toBeUndefined()
    expect(requests.dismiss).toHaveBeenCalledWith(
      'tenant-1',
      'request-1',
      expect.anything(),
      'sms_number',
    )
  })
})
