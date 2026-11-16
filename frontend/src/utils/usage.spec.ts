import { describe, it, expect } from 'vitest'
import {
  adoptionSummaryText,
  formatFailures,
  formatLastSent,
  groupUsageByTenant,
  percentOf,
} from './usage'
import type { AdminTenantUsageRow } from '@/api/apiKeyUsage.api'

describe('groupUsageByTenant', () => {
  const row = (tenantId: string, channel: string) =>
    ({
      tenantId,
      tenantName: `Tenant ${tenantId}`,
      channel,
      sendingEnabled: tenantId !== 'b',
      disabledReason: tenantId === 'b' ? 'Unpaid' : null,
      disabledAt: null,
      disabledBy: null,
    }) as AdminTenantUsageRow

  it('makes one entry per tenant, in order, holding its channel rows', () => {
    const rows = [row('a', 'EMAIL'), row('a', 'SMS'), row('b', 'EMAIL')]

    const tenants = groupUsageByTenant(rows)

    expect(tenants.map((t) => [t.tenantId, t.channels.map((c) => c.channel)])).toEqual([
      ['a', ['EMAIL', 'SMS']],
      ['b', ['EMAIL']],
    ])
    expect(tenants[1]).toMatchObject({ sendingEnabled: false, disabledReason: 'Unpaid' })
  })

  it('returns nothing for no rows', () => {
    expect(groupUsageByTenant([])).toEqual([])
  })
})

describe('percentOf', () => {
  it('rounds to five decimal places', () => {
    expect(percentOf(1, 3)).toBe(33.33333)
    expect(percentOf(2, 3)).toBe(66.66667)
    expect(percentOf(47, 50000)).toBe(0.094)
  })

  it('returns whole percentages without trailing zeros', () => {
    expect(percentOf(1, 2)).toBe(50)
    expect(percentOf(1, 1)).toBe(100)
  })

  it('guards against a zero or invalid limit', () => {
    expect(percentOf(5, 0)).toBe(0)
    expect(percentOf(5, -10)).toBe(0)
  })
})

describe('adoptionSummaryText', () => {
  it('joins the counts, with thousands separators', () => {
    expect(adoptionSummaryText({ tenants: 1200, sentThisFiscalYear: 30, disabled: 0 })).toBe(
      '1,200 tenants use Notify · 30 sent this fiscal year',
    )
  })

  it('adds the disabled count only when there are any', () => {
    expect(adoptionSummaryText({ tenants: 42, sentThisFiscalYear: 30, disabled: 2 })).toBe(
      '42 tenants use Notify · 30 sent this fiscal year · 2 disabled',
    )
  })

  it('reads naturally for a single tenant', () => {
    expect(adoptionSummaryText({ tenants: 1, sentThisFiscalYear: 1, disabled: 0 })).toBe(
      '1 tenant uses Notify · 1 sent this fiscal year',
    )
  })
})

describe('formatLastSent', () => {
  const now = new Date('2026-11-06T18:00:00Z').getTime()

  it.each([
    ['2026-11-06T09:00:00Z', 'Today'],
    ['2026-11-05T12:00:00Z', 'Yesterday'],
    ['2026-10-25T18:00:00Z', '12 days ago'],
    ['2026-08-15T18:00:00Z', 'Aug 15, 2026'],
  ])('describes %s as %s', (iso, expected) => {
    expect(formatLastSent(iso, now)).toBe(expected)
  })
})

describe('formatFailures', () => {
  it.each([
    [0, 0, '0'],
    [0, 500, '0'],
    [12, 3000, '12 (0.4%)'],
    [1500, 3000, '1,500 (50%)'],
  ])('%i of %i → %s', (failed, recipients, expected) => {
    expect(formatFailures(failed, recipients)).toBe(expected)
  })
})
