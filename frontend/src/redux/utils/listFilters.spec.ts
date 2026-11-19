import { describe, expect, it } from 'vitest'
import { toFilterParams, toSortParam } from './listFilters'

describe('toFilterParams', () => {
  it('writes each filtered column as field:in:values', () => {
    expect(toFilterParams({ channel: ['EMAIL', 'SMS'], status: ['failed'] })).toEqual([
      'channel:in:EMAIL|SMS',
      'status:in:failed',
    ])
  })

  it('leaves out columns with nothing selected', () => {
    expect(toFilterParams({ channel: [], status: ['failed'] })).toEqual(['status:in:failed'])
  })

  it('is undefined when nothing is filtered', () => {
    expect(toFilterParams({})).toBeUndefined()
    expect(toFilterParams({ channel: [] })).toBeUndefined()
  })
})

describe('toSortParam', () => {
  it('prefixes a descending sort, and sends nothing without a field and direction', () => {
    expect(toSortParam('usedToday', 'desc')).toBe('-usedToday')
    expect(toSortParam('usedToday', 'asc')).toBe('usedToday')
    expect(toSortParam(null, 'desc')).toBeUndefined()
    expect(toSortParam('usedToday', null)).toBeUndefined()
  })
})
