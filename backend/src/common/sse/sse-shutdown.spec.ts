import { describe, it, expect } from 'vitest'
import { NEVER, interval } from 'rxjs'
import { SseShutdown } from './sse-shutdown'

describe('SseShutdown', () => {
  it('completes every stream piped through it when end() is called', () => {
    const sse = new SseShutdown()
    const completed: string[] = []
    NEVER.pipe(sse.untilShutdown()).subscribe({ complete: () => completed.push('never') })
    interval(60_000)
      .pipe(sse.untilShutdown())
      .subscribe({ complete: () => completed.push('interval') })

    expect(completed).toEqual([])
    sse.end()
    expect(completed).toEqual(['never', 'interval'])
  })

  it('completes a stream opened after end() straight away', () => {
    const sse = new SseShutdown()
    sse.end()
    let complete = false
    NEVER.pipe(sse.untilShutdown()).subscribe({ complete: () => (complete = true) })
    expect(complete).toBe(true)
  })
})
