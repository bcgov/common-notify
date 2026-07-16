import { Test, TestingModule } from '@nestjs/testing'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { GcNotifyRoutingService } from './gc-notify-routing.service'
import { FeatureFlagService } from '../feature-flag/feature-flag.service'
import { FeatureFlagCode } from '../../enum/feature-flag-code.enum'

describe('GcNotifyRoutingService', () => {
  let service: GcNotifyRoutingService
  let mockFeatureFlagService: { isEnabled: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    mockFeatureFlagService = { isEnabled: vi.fn() }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GcNotifyRoutingService,
        { provide: FeatureFlagService, useValue: mockFeatureFlagService },
      ],
    }).compile()

    service = module.get<GcNotifyRoutingService>(GcNotifyRoutingService)
  })

  it('delegates to FeatureFlagService.isEnabled with the given code and tenant', async () => {
    mockFeatureFlagService.isEnabled.mockResolvedValue(true)

    const result = await service.shouldExecuteInternally(
      FeatureFlagCode.GC_NOTIFY_ROUTE_EMAIL,
      'tenant-1',
    )

    expect(result).toBe(true)
    expect(mockFeatureFlagService.isEnabled).toHaveBeenCalledWith(
      FeatureFlagCode.GC_NOTIFY_ROUTE_EMAIL,
      'tenant-1',
    )
  })

  it('returns false when the flag is disabled', async () => {
    mockFeatureFlagService.isEnabled.mockResolvedValue(false)

    const result = await service.shouldExecuteInternally(
      FeatureFlagCode.GC_NOTIFY_ROUTE_SMS,
      'tenant-2',
    )

    expect(result).toBe(false)
  })
})
