import { describe, expect, it } from 'vitest'
import { GRAFANA_URL, lokiLogsUrl } from './loki-link'

describe('lokiLogsUrl', () => {
  it("filters this namespace's backend logs on the request id, padded around the send", () => {
    const url = lokiLogsUrl(
      'req-1',
      new Date('2026-11-10T10:00:00Z'),
      new Date('2026-11-10T10:30:00Z'),
      'f6bc3f-test',
    )!

    expect(url.startsWith(`${GRAFANA_URL}/explore?orgId=1&left=`)).toBe(true)
    const left = JSON.parse(new URL(url).searchParams.get('left')!)
    expect(left.datasource).toBe('loki')
    expect(left.queries[0].expr).toBe(
      '{job="common-notify-backend",namespace="f6bc3f-test"} |= "req-1"',
    )
    expect(left.range).toEqual({
      from: String(Date.parse('2026-11-10T09:55:00Z')),
      to: String(Date.parse('2026-11-10T10:45:00Z')),
    })
  })

  it('has no link without a namespace', () => {
    expect(lokiLogsUrl('req-1', new Date(), new Date(), '')).toBeNull()
  })
})
