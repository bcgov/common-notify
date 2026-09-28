import { describe, expect, it } from 'vitest'
import reducer, { setSearch } from './templates.slice'
import { fetchTemplates } from '../thunks/templates.thunks'
import { selectTenant } from './tenant.slice'
import type { TemplateResponse } from '@/api/templates.api'
import type { Tenant } from '@/interfaces/CstarTenant'

const template = (id: string) => ({ id, name: id }) as TemplateResponse

const page = (requestId: string, items: TemplateResponse[], count = items.length) =>
  fetchTemplates.fulfilled(
    { data: items, count, page: 1, limit: 15, totalPages: 1 },
    requestId,
    undefined,
  )

const loadedWith = (items: TemplateResponse[]) =>
  reducer(reducer(undefined, fetchTemplates.pending('req-1', undefined)), page('req-1', items))

describe('templatesSlice', () => {
  it('stores the fetched page', () => {
    const state = loadedWith([template('template-a')])

    expect(state.items).toHaveLength(1)
    expect(state.hasLoaded).toBe(true)
    expect(state.isLoading).toBe(false)
  })

  it("clears the previous tenant's templates when the tenant changes", () => {
    const loaded = reducer(loadedWith([template('tenant-a-template')]), setSearch('invoice'))

    const switched = reducer(loaded, selectTenant({ id: 'tenant-b' } as Tenant))

    // Rows, paging and the query that produced them all belonged to tenant A.
    expect(switched.items).toEqual([])
    expect(switched.count).toBe(0)
    expect(switched.search).toBe('')
    // hasLoaded false + isLoading true is what keeps the table in its loading state
    // instead of rendering tenant A's rows, or an empty table, under tenant B.
    expect(switched.hasLoaded).toBe(false)
    expect(switched.isLoading).toBe(true)
  })

  it('discards an in-flight response that belongs to the previous tenant', () => {
    const inFlight = reducer(undefined, fetchTemplates.pending('tenant-a-req', undefined))
    const switched = reducer(inFlight, selectTenant({ id: 'tenant-b' } as Tenant))

    const late = reducer(switched, page('tenant-a-req', [template('tenant-a-template')]))

    expect(late.items).toEqual([])
    expect(late.hasLoaded).toBe(false)
  })

  it('ignores a slow response once a newer request is in flight', () => {
    const second = reducer(
      reducer(undefined, fetchTemplates.pending('req-1', undefined)),
      fetchTemplates.pending('req-2', undefined),
    )

    const newest = reducer(second, page('req-2', [template('current')]))
    const afterStale = reducer(newest, page('req-1', [template('superseded')]))

    expect(afterStale.items.map((item) => item.id)).toEqual(['current'])
  })

  it('keeps loading when a superseded request fails', () => {
    const second = reducer(
      reducer(undefined, fetchTemplates.pending('req-1', undefined)),
      fetchTemplates.pending('req-2', undefined),
    )

    const state = reducer(
      second,
      fetchTemplates.rejected(new Error('boom'), 'req-1', undefined, 'Failed to load templates'),
    )

    expect(state.isLoading).toBe(true)
    expect(state.error).toBeNull()
  })
})
