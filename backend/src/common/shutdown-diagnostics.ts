import type { EventEmitter } from 'node:events'

/** The most recent error logged, kept so a failed shutdown can name its cause. */
export interface RecordedError {
  message: string
  context?: string
  stack?: string
  at: string
}

let lastError: RecordedError | undefined

/** Names the last logged error for a failed shutdown, or says there wasn't one. */
function describeLastError(error: RecordedError | undefined): string {
  if (!error) return 'no error was logged'
  const stack = error.stack ? `\n${error.stack}` : ''
  return `last error logged at ${error.at}: [${error.context ?? 'unknown'}] ${error.message}${stack}`
}

export function recordError(error: Omit<RecordedError, 'at'>): void {
  lastError = { ...error, at: new Date().toISOString() }
}

/**
 * Make a failed shutdown explain itself.
 *
 * When a shutdown hook throws, Nest logs the error and calls process.exit(1) straight after. The
 * log goes through winston, which writes asynchronously, so it never reaches the pod log - the
 * pod just disappears a second into its grace period. stderr writes are synchronous, so these
 * lines survive an immediate exit: one when SIGTERM arrives, and on a non-zero exit the code
 * and the last error logged.
 */
export function installShutdownDiagnostics(
  target: Pick<EventEmitter, 'on' | 'once'> = process,
  write: (line: string) => void = (line) => process.stderr.write(line),
): void {
  target.once('SIGTERM', () => {
    write(`[shutdown] SIGTERM received at ${new Date().toISOString()}\n`)
  })
  target.on('exit', (code: number) => {
    if (code === 0) return
    const cause = describeLastError(lastError)
    write(`[shutdown] process exiting with code ${code}; ${cause}\n`)
  })
}
