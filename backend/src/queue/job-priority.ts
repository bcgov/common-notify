import type { ConfigService } from '@nestjs/config'

/** How urgently a send goes out. Accepted on NotifySimpleRequest, hidden in Swagger for now. */
export const NOTIFICATION_PRIORITIES = ['high', 'normal', 'low'] as const
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number]

/** BullMQ priorities, lower first. QUEUE_PRIORITY_HIGH/NORMAL/LOW override them. */
export const DEFAULT_JOB_PRIORITIES: Record<NotificationPriority, number> = {
  high: 1,
  normal: 5,
  low: 10,
}

/**
 * The BullMQ `priority` for a level. Every job is given one: BullMQ runs jobs without a
 * priority ahead of all prioritised jobs.
 */
export function jobPriority(level: NotificationPriority, configService?: ConfigService): number {
  return configService?.get<number>(`queue.priority.${level}`) || DEFAULT_JOB_PRIORITIES[level]
}

/** The level a send asked for; otherwise normal, or low for a merge (bulk) send. */
export function requestPriority(
  request: { priority?: NotificationPriority } | undefined,
  mailMerge: boolean,
): NotificationPriority {
  return request?.priority ?? (mailMerge ? 'low' : 'normal')
}
