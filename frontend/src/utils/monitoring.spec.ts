import { describe, it, expect } from 'vitest'
import { formatAgo, formatBytes, formatDuration, formatQueueName, formatRate } from './monitoring'

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
