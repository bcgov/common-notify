import { describe, it, expect } from 'vitest'
import { Route } from './health'

describe('/admin/health', () => {
  it('sends old Service health links to System', () => {
    let thrown: unknown
    try {
      Route.options.beforeLoad!({} as never)
    } catch (error) {
      thrown = error
    }
    expect((thrown as { options: unknown }).options).toMatchObject({
      to: '/admin/monitoring',
      replace: true,
    })
  })
})
