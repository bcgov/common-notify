import { Logger } from '@nestjs/common'

/**
 * Safe handling of ioredis errors.
 *
 * ioredis records the command that failed on the error it raises, arguments included. For a
 * failed AUTH that means the Redis password sits on the error object:
 *
 *   ReplyError: WRONGPASS invalid username-password pair or user is disabled.
 *     command: { name: 'auth', args: [ 'hunter2' ] }
 *
 * If nothing listens for a client's `error` event, Node's default handler prints that whole
 * object to stderr, putting the credential into container logs and anything shipping them.
 * Every Redis client and Bull queue must therefore have an error listener attached, and errors
 * must be formatted through formatRedisError rather than logged as objects.
 */

/** An object that emits Node-style events; Redis clients and Bull queues both qualify. */
interface ErrorEmitter {
  on(event: 'error', listener: (error: unknown) => void): unknown
}

/** Message text only. Redis error messages never contain the credential; the command args do. */
export function formatRedisError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }
  return String(error)
}

/**
 * Replace the recorded command arguments in place, so the credential is gone even if some other
 * listener logs the error object wholesale.
 */
export function scrubRedisCommand(error: unknown): unknown {
  const command = (error as { command?: { args?: unknown[] } } | null)?.command
  if (command && Array.isArray(command.args) && command.args.length > 0) {
    command.args = ['[redacted]']
  }
  return error
}

/**
 * Attach an error listener that logs safely. Also prevents the unhandled-error crash: an
 * ioredis client with no `error` listener terminates the process on a connection failure.
 */
export function attachRedisErrorLogging(emitter: ErrorEmitter, context: string): void {
  const logger = new Logger(context)
  emitter.on('error', (error: unknown) => {
    scrubRedisCommand(error)
    logger.error(`Redis error: ${formatRedisError(error)}`)
  })
}
