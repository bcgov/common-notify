import { Injectable } from '@nestjs/common'
import { FeatureFlagService } from '../feature-flag/feature-flag.service'
import { FeatureFlagCode } from '../../enum/feature-flag-code.enum'

/**
 * Decides, per tenant and per GC Notify operation, whether a request should
 * execute internally (our own Notify pipeline) or passthrough to the real GC
 * Notify API. Kept separate from FeatureFlagGuard/@FeatureFlag() (which reject
 * the request when a flag is off) because here "off" means "branch to
 * passthrough," not "reject."
 */
@Injectable()
export class GcNotifyRoutingService {
  constructor(private readonly featureFlagService: FeatureFlagService) {}

  async shouldExecuteInternally(code: FeatureFlagCode, tenantId: string): Promise<boolean> {
    return this.featureFlagService.isEnabled(code, tenantId)
  }
}
