import { describe, it, expect } from 'vitest'
import {
  backlogSummary,
  formatAgo,
  formatBytes,
  formatDuration,
  formatQueueName,
  formatRate,
  monitoringWarnings,
} from './monitoring'
import { snapshot } from '@/pages/admin/monitoring/monitoring.fixture'
import type { MessageChannelStats } from '@/interfaces/queueMonitoring.interface'

describe('monitoring formatters', () => {
  it('formats bytes in the largest sensible unit', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(768 * 1024 * 1024)).toBe('768 MB')
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GB')
  })

  it('formats durations using their two largest units', () => {
    expect(formatDuration(45_000)).toBe('45s')
    expect(formatDuration(190_000)).toBe('3m 10s')
    expect(formatDuration(7_500_000)).toBe('2h 5m')
    expect(formatDuration(4 * 86_400_000 + 7_200_000)).toBe('4d 2h')
    expect(formatDuration(-5)).toBe('0s')
  })

  it('formats relative times against a reference time', () => {
    expect(formatAgo('2026-10-01T18:00:00.000Z', Date.parse('2026-10-01T18:01:30.000Z'))).toBe(
      '1m 30s ago',
    )
    expect(formatAgo(null, 0)).toBe('—')
  })

  it('names known queues and passes unknown ones through', () => {
    expect(formatQueueName('notification-ingestion')).toBe('Ingestion')
    expect(formatQueueName('something-new')).toBe('something-new')
  })

  it('formats per-minute rates', () => {
    expect(formatRate(12.345)).toBe('12.3/min')
  })
})

describe('backlogSummary', () => {
  const channel = (overrides: Partial<MessageChannelStats>): MessageChannelStats => ({
    channel: 'EMAIL',
    pending: 0,
    oldestPendingAgeMs: null,
    sent: [],
    failed: [],
    sentPerMinute: 0,
    failedPerMinute: 0,
    estimatedClearMinutes: 0,
    ...overrides,
  })

  it('totals pending across channels and takes the oldest and slowest', () => {
    expect(
      backlogSummary([
        channel({ pending: 63, oldestPendingAgeMs: 50_000, estimatedClearMinutes: 3 }),
        channel({
          channel: 'SMS',
          pending: 7,
          oldestPendingAgeMs: 90_000,
          estimatedClearMinutes: 9,
        }),
      ]),
    ).toEqual({ pending: 70, oldestPendingAgeMs: 90_000, clearsInMinutes: 9, stuck: false })
  })

  it('has no estimate when nothing is waiting', () => {
    expect(backlogSummary([channel({})])).toEqual({
      pending: 0,
      oldestPendingAgeMs: null,
      clearsInMinutes: null,
      stuck: false,
    })
  })

  it('calls it stuck when a channel has messages waiting and is not sending', () => {
    const summary = backlogSummary([
      channel({ pending: 4, oldestPendingAgeMs: 1_000, estimatedClearMinutes: null }),
    ])
    expect(summary).toMatchObject({ stuck: true, clearsInMinutes: null })
  })
})

describe('monitoringWarnings', () => {
  it('has none for a healthy snapshot', () => {
    expect(monitoringWarnings(snapshot())).toEqual([])
  })

  it('names the part each warning is about and the page that explains it', () => {
    const data = snapshot()
    data.redis = { ...data.redis, reasons: ['Memory is high'] }
    data.providers[0] = { ...data.providers[0], reasons: ['Failing'] }
    data.queues[0] = { ...data.queues[0], reasons: ['No pod is processing'] }
    data.reconciler = { ...data.reconciler, reasons: ['Gave up on 2'] }

    expect(monitoringWarnings(data).map((w) => [w.message, w.page?.to])).toEqual([
      ['Redis: Memory is high', '/admin/health'],
      ['CHES (Email): Failing', '/admin/health'],
      ['Email delivery: No pod is processing', '/admin/monitoring'],
      ['Delivery recovery: Gave up on 2', '/admin/monitoring'],
    ])
  })
})
