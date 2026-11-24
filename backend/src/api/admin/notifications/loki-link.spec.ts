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

    expect(url.startsWith(`${GRAFANA_URL}/explore?`)).toBe(true)
    const params = new URL(url).searchParams
    expect(params.get('schemaVersion')).toBe('1')
    const panes = Object.values(JSON.parse(params.get('panes')!)) as Array<{
      datasource: string
      queries: { datasource: unknown; expr: string }[]
      range: unknown
    }>
    expect(panes).toHaveLength(1)
    const [pane] = panes
    expect(pane.datasource).toBe('loki')
    expect(pane.queries[0].datasource).toEqual({ type: 'loki', uid: 'loki' })
    expect(pane.queries[0].expr).toBe(
      '{job="common-notify-backend",namespace="f6bc3f-test"} |= "req-1"',
    )
    expect(pane.range).toEqual({
      from: String(Date.parse('2026-11-10T09:55:00Z')),
      to: String(Date.parse('2026-11-10T10:45:00Z')),
    })
  })

  it('has no link without a namespace', () => {
    expect(lokiLogsUrl('req-1', new Date(), new Date(), '')).toBeNull()
  })
})
