import { describe, expect, it, vi } from 'vitest'
import { SmsNumberRequestsController } from './sms-number-requests.controller'
import type { SmsNumberRequestsService } from './sms-number-requests.service'
import type { SmsNumbersService } from './sms-numbers.service'

describe('SmsNumberRequestsController.getLatest', () => {
  const setup = (testEnvironment: boolean) => {
    const requests = { findLatestForTenant: vi.fn().mockResolvedValue(null) }
    const numbers = {
      resolveSenderNumber: vi.fn().mockResolvedValue('+15814360804'),
      defaultNumberAssignable: vi.fn().mockReturnValue(testEnvironment),
    }
    const controller = new SmsNumberRequestsController(
      requests as unknown as SmsNumberRequestsService,
      numbers as unknown as SmsNumbersService,
    )
    return { controller, requests, numbers }
  }
  const req = { tenant: { id: 'tenant-1' } } as never

  it("returns the tenant's request with the number it sends from meanwhile", async () => {
    const { controller, requests, numbers } = setup(true)

    await expect(controller.getLatest(req)).resolves.toEqual({
      request: null,
      senderNumber: '+15814360804',
      testEnvironment: true,
    })
    expect(requests.findLatestForTenant).toHaveBeenCalledWith('tenant-1')
    expect(numbers.resolveSenderNumber).toHaveBeenCalledWith('tenant-1')
  })

  it('reports prod as not a test environment', async () => {
    const { controller } = setup(false)

    await expect(controller.getLatest(req)).resolves.toMatchObject({ testEnvironment: false })
  })
})
