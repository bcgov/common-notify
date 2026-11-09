import { describe, it, expect } from 'vitest'
import { Route } from './usage'

describe('/admin/usage', () => {
  it('sends old Usage & Limits links to Manage Tenants', () => {
    let thrown: unknown
    try {
      Route.options.beforeLoad!({} as never)
    } catch (error) {
      thrown = error
    }
    expect((thrown as { options: unknown }).options).toMatchObject({
      to: '/admin/tenants',
      replace: true,
    })
  })
})
