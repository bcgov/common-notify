import { describe, expect, it } from 'vitest'
import { toListQueryString } from './listQuery'

describe('toListQueryString', () => {
  it('writes each part, repeating filter, and leaves out empty ones', () => {
    const qs = toListQueryString({
      page: 2,
      limit: 30,
      search: 'Parks',
      sort: '-createdAt',
      filter: ['status:in:failed', 'channel:in:SMS'],
    })
    expect([...new URLSearchParams(qs).entries()]).toEqual([
      ['page', '2'],
      ['limit', '30'],
      ['search', 'Parks'],
      ['sort', '-createdAt'],
      ['filter', 'status:in:failed'],
      ['filter', 'channel:in:SMS'],
    ])
    expect(toListQueryString({ search: '', filter: [] })).toBe('')
  })
})
