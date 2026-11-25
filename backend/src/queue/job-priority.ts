import type { ConfigService } from '@nestjs/config'
import { FeatureFlagCode } from '../enum/feature-flag-code.enum'

/**
 * How urgently a send goes out. Accepted on NotifySimpleRequest, hidden in Swagger for now, and
 * ignored unless the notification_priority feature flag is on.
 */
export const NOTIFICATION_PRIORITIES = ['high', 'normal', 'low'] as const
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number]

/** BullMQ priorities, lower first. QUEUE_PRIORITY_HIGH/NORMAL/LOW override them. */
export const DEFAULT_JOB_PRIORITIES: Record<NotificationPriority, number> = {
  high: 1,
  normal: 5,
  low: 10,
}

/** BullMQ's highest accepted priority. 0 means "no priority", which runs ahead of every level. */
const MAX_JOB_PRIORITY = 2_097_152

/**
 * The BullMQ `priority` for a level. Every job is given one: BullMQ runs jobs without a
 * priority ahead of all prioritised jobs. A configured value BullMQ would reject, or 0, falls
 * back to the default rather than failing every enqueue.
 */
export function jobPriority(level: NotificationPriority, configService?: ConfigService): number {
  const configured = configService?.get<number>(`queue.priority.${level}`)
  const valid =
    typeof configured === 'number' &&
    Number.isInteger(configured) &&
    configured >= 1 &&
    configured <= MAX_JOB_PRIORITY
  return valid ? configured : DEFAULT_JOB_PRIORITIES[level]
}

/** The one call needed from FeatureFlagService, so the queue layer need not import the api one. */
export interface FeatureFlagChecker {
  isEnabled(code: string, tenantId?: string): Promise<boolean>
}

/**
 * Whether the tenant's sends are queued by priority (the notification_priority flag). Off when
 * no flag service is available.
 */
export async function priorityLanesEnabled(
  featureFlags: FeatureFlagChecker | undefined,
  tenantId: string,
): Promise<boolean> {
  return (await featureFlags?.isEnabled(FeatureFlagCode.NOTIFICATION_PRIORITY, tenantId)) ?? false
}

/**
 * The level a send asked for - at the top level, or else on `email`, where the email-only
 * routes' body carries it - otherwise normal, or low for a merge (bulk) send. With priority lanes
 * off every send is normal, so a merge is not held back behind single sends.
 */
export function requestPriority(
  request:
    | { priority?: NotificationPriority; email?: { priority?: NotificationPriority } }
    | undefined,
  mailMerge: boolean,
  lanesEnabled: boolean,
): NotificationPriority {
  if (!lanesEnabled) return 'normal'
  return request?.priority ?? request?.email?.priority ?? (mailMerge ? 'low' : 'normal')
}
