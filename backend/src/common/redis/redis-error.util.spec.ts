import { EventEmitter } from 'node:events'
import { Logger } from '@nestjs/common'
import { vi } from 'vitest'
import { attachRedisErrorLogging, formatRedisError, scrubRedisCommand } from './redis-error.util'

const PASSWORD = 'P8F8l80LnS'

/** The error ioredis raises when AUTH is rejected: the password rides along on `command.args`. */
function wrongPassError() {
  const error = new Error('WRONGPASS invalid username-password pair or user is disabled.')
  error.name = 'ReplyError'
  ;(error as any).command = { name: 'auth', args: [PASSWORD] }
  return error
}

describe('redis error handling', () => {
  // Unconditional: an inline restore is skipped when an assertion throws first, leaking the
  // Logger spy into the rest of the file.
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('formatRedisError', () => {
    it('never includes the credential carried on the command', () => {
      const formatted = formatRedisError(wrongPassError())

      expect(formatted).not.toContain(PASSWORD)
      expect(formatted).toBe(
        'ReplyError: WRONGPASS invalid username-password pair or user is disabled.',
      )
    })

    it('handles a non-Error value without throwing', () => {
      expect(formatRedisError('connection reset')).toBe('connection reset')
    })
  })

  describe('scrubRedisCommand', () => {
    it('removes the arguments so another logger cannot leak them either', () => {
      const error = wrongPassError()

      scrubRedisCommand(error)

      expect((error as any).command.args).toEqual(['[redacted]'])
      expect(JSON.stringify((error as any).command)).not.toContain(PASSWORD)
    })

    it('leaves an error without a command alone', () => {
      const error = new Error('read ETIMEDOUT')
      expect(() => scrubRedisCommand(error)).not.toThrow()
    })
  })

  describe('attachRedisErrorLogging', () => {
    it('logs the message without the password and scrubs the error object', () => {
      const logged: string[] = []
      vi.spyOn(Logger.prototype, 'error').mockImplementation((message: any) => {
        logged.push(String(message))
      })

      const emitter = new EventEmitter()
      attachRedisErrorLogging(emitter, 'Queue[test]')
      const error = wrongPassError()
      emitter.emit('error', error)

      expect(logged).toHaveLength(1)
      expect(logged[0]).toContain('WRONGPASS')
      expect(logged.join()).not.toContain(PASSWORD)
      expect((error as any).command.args).toEqual(['[redacted]'])
    })

    it('keeps an emitted error from crashing the process', () => {
      const emitter = new EventEmitter()
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

      // An EventEmitter with no 'error' listener rethrows; attaching one is what prevents it.
      attachRedisErrorLogging(emitter, 'Queue[test]')

      expect(() => emitter.emit('error', wrongPassError())).not.toThrow()
    })
  })
})
