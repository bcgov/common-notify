import { describe, it, expect, vi } from 'vitest'
import { enableGracefulShutdown } from './graceful-shutdown'

describe('enableGracefulShutdown', () => {
  it('exits the process after the hooks, since a re-raised SIGTERM is ignored by PID 1', () => {
    const app = { enableShutdownHooks: vi.fn() }
    enableGracefulShutdown(app)
    expect(app.enableShutdownHooks).toHaveBeenCalledWith([], { useProcessExit: true })
  })
})
