import type { HealthWarning, HealthWarningPage } from '@/components/HealthBanner'
import { formatChannel } from './channels'
import type { ComponentStatus, ComponentStatusGroup } from '@/components/ComponentStatusList'
import type {
  HealthStatus,
  MessageChannelStats,
  ProviderStats,
  QueueMonitoring,
} from '@/interfaces/queueMonitoring.interface'

const QUEUE_LABELS: Record<string, string> = {
  'notification-ingestion': 'Ingestion',
  'email-delivery': 'Email delivery',
  'sms-delivery': 'SMS delivery',
  'webhook-delivery': 'Webhook delivery',
}

export function formatQueueName(name: string): string {
  return QUEUE_LABELS[name] ?? name
}

export const HEALTH_LABELS: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`
}

/** "45s", "3m 10s", "2h 5m", "4d 2h" — the two largest units, for ages and uptimes. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

export function formatAgo(iso: string | null, now: number): string {
  if (!iso) return '—'
  return `${formatDuration(now - new Date(iso).getTime())} ago`
}

export function formatRate(perMinute: number): string {
  return `${perMinute.toLocaleString(undefined, { maximumFractionDigits: 1 })}/min`
}

/** "CHES (Email)". */
export function providerLabel(provider: ProviderStats): string {
  return `${provider.name} (${formatChannel(provider.channel)})`
}

/** The admin monitoring pages, and which part of the snapshot each one details. */
export const MONITORING_PAGES = {
  overview: { label: 'Overview', to: '/admin' },
  system: { label: 'System', to: '/admin/monitoring' },
} as const satisfies Record<string, HealthWarningPage>

/** Every warning in the snapshot, each pointing at the page that explains it. */
export function monitoringWarnings(data: QueueMonitoring): HealthWarning[] {
  const { system } = MONITORING_PAGES
  return [
    ...data.redis.reasons.map((reason) => ({ message: `Redis: ${reason}`, page: system })),
    ...data.providers.flatMap((provider) =>
      provider.reasons.map((reason) => ({
        message: `${providerLabel(provider)}: ${reason}`,
        page: system,
      })),
    ),
    ...data.queues.flatMap((queue) =>
      queue.reasons.map((reason) => ({
        message: `${formatQueueName(queue.name)}: ${reason}`,
        page: system,
      })),
    ),
    ...data.reconciler.reasons.map((reason) => ({
      message: `Delivery recovery: ${reason}`,
      page: system,
    })),
  ]
}

/** Each part of the service with a status of its own, grouped for the Overview. */
export function componentStatuses(data: QueueMonitoring): ComponentStatusGroup[] {
  const entry = (name: string, status: HealthStatus): ComponentStatus => ({
    name,
    status,
    statusLabel: HEALTH_LABELS[status],
  })
  return [
    {
      label: 'Delivery providers',
      components: data.providers.map((provider) => entry(providerLabel(provider), provider.status)),
    },
    {
      label: 'Queues',
      components: data.queues.map((queue) => entry(formatQueueName(queue.name), queue.status)),
    },
    {
      label: 'Supporting services',
      components: [
        entry('Redis', data.redis.status),
        entry('Delivery recovery', data.reconciler.status),
      ],
    },
  ]
}

export interface BacklogSummary {
  /** Messages accepted and not yet sent or failed, across channels. */
  pending: number
  oldestPendingAgeMs: number | null
  /** The slowest channel's estimate; null when nothing is pending or nothing is sending. */
  clearsInMinutes: number | null
  /** Something is pending on a channel that isn't sending at all. */
  stuck: boolean
}

export function backlogSummary(messages: MessageChannelStats[]): BacklogSummary {
  const ages = messages.flatMap((m) =>
    m.oldestPendingAgeMs === null ? [] : [m.oldestPendingAgeMs],
  )
  const estimates = messages.flatMap((m) =>
    m.estimatedClearMinutes ? [m.estimatedClearMinutes] : [],
  )
  return {
    pending: messages.reduce((sum, m) => sum + m.pending, 0),
    oldestPendingAgeMs: ages.length > 0 ? Math.max(...ages) : null,
    clearsInMinutes: estimates.length > 0 ? Math.max(...estimates) : null,
    stuck: messages.some((m) => m.pending > 0 && m.estimatedClearMinutes === null),
  }
}
