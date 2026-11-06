import { describe, it, expect } from 'vitest'
import { Route } from './monitoring'

/** What beforeLoad does for a given search: the redirect it throws, or undefined to render. */
function redirectFor(search: { tab?: string }) {
  try {
    Route.options.beforeLoad!({ search } as never)
    return undefined
  } catch (error) {
    return (error as { options: unknown }).options
  }
}

describe('/admin/monitoring', () => {
  it('renders Queues & processing when there is no tab', () => {
    expect(redirectFor({})).toBeUndefined()
  })

  it.each([
    ['overview', '/admin'],
    ['failures', '/admin'],
    ['system', '/admin/monitoring'],
    ['not-a-tab', '/admin/monitoring'],
  ])('sends an old ?tab=%s link to %s, without the tab', (tab, to) => {
    expect(redirectFor({ tab })).toMatchObject({ to, replace: true })
    expect(redirectFor({ tab })).not.toHaveProperty('search')
  })

  it('keeps the tab through validation so the redirect can see it', () => {
    const validate = Route.options.validateSearch as (search: Record<string, unknown>) => unknown
    expect(validate({ tab: 'failures', other: 1 })).toEqual({ tab: 'failures' })
    expect(validate({ tab: 3 })).toEqual({})
  })
})
