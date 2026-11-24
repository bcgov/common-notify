import type { MonoTypeOperatorFunction } from 'rxjs'
import { ReplaySubject, takeUntil } from 'rxjs'

/**
 * Ends a controller's open SSE streams when the app shuts down.
 *
 * Nest's HTTP close waits for every open response, and an SSE stream never finishes by itself,
 * so one open tab holds a stopping pod until the termination grace period kills it. Pipe each
 * stream through untilShutdown() and call end() from the controller's onModuleDestroy, which Nest
 * runs before it closes the HTTP server. The client sees the stream end and reconnects to
 * another pod.
 *
 * The server keeps accepting requests until the queue drain finishes, so a stream opened after
 * end() must end too: the signal is replayed to late subscribers.
 */
export class SseShutdown {
  private readonly shutdown$ = new ReplaySubject<void>(1)

  untilShutdown<T>(): MonoTypeOperatorFunction<T> {
    return takeUntil(this.shutdown$)
  }

  end(): void {
    this.shutdown$.next()
    this.shutdown$.complete()
  }
}
