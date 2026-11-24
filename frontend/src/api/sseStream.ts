/**
 * The server ended an SSE stream, as a backend pod does when it shuts down.
 *
 * fetch-event-source treats a stream that ends cleanly as finished and stops for good, so the
 * page would quietly lose live updates. Throwing this from onclose sends it through onerror
 * instead, which retries and reaches a pod that is still running.
 */
export class StreamClosedError extends Error {
  constructor() {
    super('Stream closed by the server')
    this.name = 'StreamClosedError'
  }
}

/** Pass as fetch-event-source's onclose to reconnect when the server ends the stream. */
export function reconnectOnClose(): never {
  throw new StreamClosedError()
}
