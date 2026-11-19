import type { EntityManager } from 'typeorm'
import { TenantLimit } from './entities/tenant-limit.entity'
import { TenantLimitAlert } from './entities/tenant-limit-alert.entity'
import { NotificationChannel } from '../../enum/notification-channel.enum'

/**
 * Default notification limits applied per channel when a tenant is created.
 * Mirrors the seed values in migrations V40 and V81.
 */
const DEFAULT_LIMITS: Array<{
  channelCode: string
  rateLimitPerMinute: number
  dailyLimit: number
  annualLimit: number
}> = [
  {
    channelCode: NotificationChannel.EMAIL,
    rateLimitPerMinute: 1000,
    dailyLimit: 100000,
    annualLimit: 20000000,
  },
  {
    channelCode: NotificationChannel.SMS,
    rateLimitPerMinute: 1000,
    dailyLimit: 10000,
    annualLimit: 100000,
  },
]

/** Channels that receive default alert configuration. */
const ALERT_CHANNELS: string[] = [NotificationChannel.EMAIL, NotificationChannel.SMS]

/** Default warning threshold (percent of a limit) for a new tenant. */
export const DEFAULT_WARN_THRESHOLD_PERCENT = 80

/**
 * Give a tenant its per-channel limit rows and alert configuration.
 *
 * Idempotent: existing rows are left untouched (ON CONFLICT DO NOTHING), so calling it again
 * never clobbers limits or thresholds an admin has customized.
 */
export async function seedTenantLimitDefaults(
  manager: EntityManager,
  tenantId: string,
): Promise<void> {
  await manager
    .createQueryBuilder()
    .insert()
    .into(TenantLimit)
    .values(
      DEFAULT_LIMITS.map((limit) => ({
        ...limit,
        tenantId,
        createdBy: 'system',
        updatedBy: 'system',
      })),
    )
    .orIgnore()
    .execute()

  await manager
    .createQueryBuilder()
    .insert()
    .into(TenantLimitAlert)
    .values(
      ALERT_CHANNELS.map((channelCode) => ({
        tenantId,
        channelCode,
        warnThresholdPercent: DEFAULT_WARN_THRESHOLD_PERCENT,
        createdBy: 'system',
        updatedBy: 'system',
      })),
    )
    .orIgnore()
    .execute()
}
