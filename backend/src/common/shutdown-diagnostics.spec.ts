import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { installShutdownDiagnostics, recordError } from './shutdown-diagnostics'

function install() {
  const target = new EventEmitter()
  const write = vi.fn()
  installShutdownDiagnostics(target, write)
  return { target, write }
}

describe('installShutdownDiagnostics', () => {
  it('notes when SIGTERM arrives', () => {
    const { target, write } = install()
    target.emit('SIGTERM')
    expect(write).toHaveBeenCalledWith(expect.stringMatching(/^\[shutdown\] SIGTERM received at /))
  })

  it('names the last error logged when the process exits non-zero', () => {
    // As Nest does on a failed shutdown: log through the app logger, then process.exit(1).
    recordError({
      message: 'Error happened during shutdown',
      context: 'NestApplicationContext',
      stack: 'Error: Connection is closed.\n    at quit (ioredis)',
    })
    const { target, write } = install()

    target.emit('exit', 1)

    const line = write.mock.calls[0][0] as string
    expect(line).toMatch(/process exiting with code 1/)
    expect(line).toMatch(/\[NestApplicationContext\] Error happened during shutdown/)
    expect(line).toMatch(/Connection is closed/)
  })

  it('stays quiet on a clean exit', () => {
    const { target, write } = install()
    target.emit('exit', 0)
    expect(write).not.toHaveBeenCalled()
  })
})
