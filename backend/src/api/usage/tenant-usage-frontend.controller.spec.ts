import { vi, describe, it, expect, beforeEach } from 'vitest'
import { TenantUsageFrontendController } from './tenant-usage-frontend.controller'
import type { TenantUsageService } from './tenant-usage.service'
import { NotificationChannel } from '../../enum/notification-channel.enum'

describe('TenantUsageFrontendController', () => {
  const usage = { tenantId: 't-1', fiscalYearStart: '2026-04-01T00:00:00.000Z', channels: [] }
  const service = {
    getTenantUsage: vi.fn(),
    getUsageHistory: vi.fn(),
    updateThreshold: vi.fn(),
  }
  const controller = new TenantUsageFrontendController(service as unknown as TenantUsageService)
  // NotifyFrontendRoleGuard attaches the selected tenant and the user's guid to the request.
  const req = { tenant: { id: 't-1' }, userGuid: 'user-guid' } as never

  beforeEach(() => {
    vi.clearAllMocks()
    service.getTenantUsage.mockResolvedValue(usage)
    service.getUsageHistory.mockResolvedValue([])
    service.updateThreshold.mockResolvedValue(usage)
  })

  it("returns the selected tenant's usage", async () => {
    await expect(controller.getUsage(req)).resolves.toBe(usage)
    expect(service.getTenantUsage).toHaveBeenCalledWith('t-1')
  })

  it("returns the selected tenant's history", async () => {
    await expect(controller.getHistory(req)).resolves.toEqual([])
    expect(service.getUsageHistory).toHaveBeenCalledWith('t-1')
  })

  it("updates the selected tenant's threshold as the signed-in user", async () => {
    await expect(
      controller.updateThreshold(req, {
        channel: NotificationChannel.SMS,
        warnThresholdPercent: 70,
      }),
    ).resolves.toBe(usage)
    expect(service.updateThreshold).toHaveBeenCalledWith('t-1', 'SMS', 70, 'user-guid')
  })
})
