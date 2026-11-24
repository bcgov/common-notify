import type { INestApplicationContext } from '@nestjs/common'

/**
 * Run Nest's shutdown hooks on a termination signal, then exit.
 *
 * The app runs as PID 1 in its container, and the kernel ignores a signal sent to PID 1 that it
 * has no handler for. Nest's default re-raises SIGTERM once the hooks finish, which then does
 * nothing: any handle still open keeps the process alive until the grace period kills it.
 * useProcessExit calls process.exit instead, which PID 1 cannot ignore.
 */
export function enableGracefulShutdown(app: Pick<INestApplicationContext, 'enableShutdownHooks'>) {
  app.enableShutdownHooks([], { useProcessExit: true })
}
