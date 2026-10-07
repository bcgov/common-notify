import type { HealthStatus } from '@/interfaces/queueMonitoring.interface'

const QUEUE_LABELS: Record<string, string> = {
  'notification-ingestion': 'Ingestion',
  'email-delivery': 'Email delivery',
  'sms-delivery': 'SMS delivery',
  'webhook-delivery': 'Webhook delivery',
}

export function formatQueueName(name: string): string {
  return QUEUE_LABELS[name] ?? name
}

const CHANNEL_LABELS: Record<string, string> = {
  EMAIL: 'Email',
  SMS: 'SMS',
  MSGAPP: 'In-app',
}

export function formatMessageChannel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel
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
