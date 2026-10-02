import * as http from 'http'
import type { AddressInfo } from 'net'
import { LokiTransport } from './loki-transport'

const MESSAGE = Symbol.for('message') as unknown as string
const LEVEL = Symbol.for('level') as unknown as string

interface Capture {
  body: string
  path: string
}

function startLoki(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
  const received: Capture[] = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      received.push({ body, path: req.url ?? '' })
      handler(req, res)
    })
  })
  return new Promise<{ url: string; received: Capture[]; close: () => Promise<void> }>(
    (resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as AddressInfo
        resolve({
          url: `http://127.0.0.1:${port}`,
          received,
          close: () =>
            new Promise<void>((done) => {
              server.closeAllConnections?.()
              server.close(() => done())
            }),
        })
      })
    },
  )
}

function entry(line: string, level = 'info'): Record<string, unknown> {
  return { [MESSAGE]: line, [LEVEL]: level, timestamp: '2026-10-02T12:00:00.000Z' }
}

function makeTransport(url: string, overrides: Record<string, unknown> = {}) {
  const reported: string[] = []
  const transport = new LokiTransport({
    url,
    labels: { namespace: 'f6bc3f-prod', app: 'backend' },
    flushIntervalMs: 60_000,
    report: (m) => reported.push(m),
    ...overrides,
  })
  return { transport, reported }
}

describe('LokiTransport', () => {
  it('posts to the push endpoint with exactly [timestamp, line] per value', async () => {
    const loki = await startLoki((_req, res) => res.writeHead(204).end())
    const { transport } = makeTransport(loki.url)

    transport.log(entry('{"msg":"a user-agent with a \\" quote"}'), () => {})
    await transport.flush()

    expect(loki.received).toHaveLength(1)
    expect(loki.received[0].path).toBe('/loki/api/v1/push')

    const payload = JSON.parse(loki.received[0].body)
    expect(payload.streams).toHaveLength(1)
    expect(payload.streams[0].stream).toEqual({
      namespace: 'f6bc3f-prod',
      app: 'backend',
      level: 'info',
    })
    // The winston-loki bug was a third element holding raw winston meta, which
    // Loki rejects as structured metadata.
    for (const value of payload.streams[0].values) {
      expect(value).toHaveLength(2)
      expect(typeof value[0]).toBe('string')
      expect(typeof value[1]).toBe('string')
    }

    transport.close()
    await loki.close()
  })

  it('appends /loki/api/v1/push only when the url does not already have it', async () => {
    const loki = await startLoki((_req, res) => res.writeHead(204).end())
    const { transport } = makeTransport(`${loki.url}/loki/api/v1/push`)

    transport.log(entry('{"msg":"x"}'), () => {})
    await transport.flush()

    expect(loki.received[0].path).toBe('/loki/api/v1/push')
    transport.close()
    await loki.close()
  })

  it('splits entries into one stream per level', async () => {
    const loki = await startLoki((_req, res) => res.writeHead(204).end())
    const { transport } = makeTransport(loki.url)

    transport.log(entry('{"msg":"a"}', 'info'), () => {})
    transport.log(entry('{"msg":"b"}', 'error'), () => {})
    transport.log(entry('{"msg":"c"}', 'info'), () => {})
    await transport.flush()

    const payload = JSON.parse(loki.received[0].body)
    const levels = payload.streams.map((s: { stream: { level: string } }) => s.stream.level).sort()
    expect(levels).toEqual(['error', 'info'])
    const info = payload.streams.find(
      (s: { stream: { level: string } }) => s.stream.level === 'info',
    )
    expect(info.values).toHaveLength(2)

    transport.close()
    await loki.close()
  })

  it('treats a non-2xx response as a failure and reports it', async () => {
    const loki = await startLoki((_req, res) => {
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end("couldn't parse push request")
    })
    const { transport, reported } = makeTransport(loki.url)

    transport.log(entry('{"msg":"a"}'), () => {})
    await transport.flush()

    expect(reported).toHaveLength(1)
    expect(reported[0]).toContain('HTTP 400')
    expect(reported[0]).toContain("couldn't parse push request")
    expect(reported[0]).toContain('dropped a batch of 1 entries')

    transport.close()
    await loki.close()
  })

  it('recovers on the next batch after a failure', async () => {
    let fail = true
    const loki = await startLoki((_req, res) => {
      if (fail) {
        res.writeHead(500).end('boom')
      } else {
        res.writeHead(204).end()
      }
    })
    const { transport, reported } = makeTransport(loki.url)

    transport.log(entry('{"msg":"a"}'), () => {})
    await transport.flush()
    expect(reported[0]).toContain('HTTP 500')

    fail = false
    transport.log(entry('{"msg":"b"}'), () => {})
    await transport.flush()

    expect(loki.received).toHaveLength(2)
    expect(reported.some((m) => m.includes('recovered after 1 failed batch'))).toBe(true)

    transport.close()
    await loki.close()
  })

  it('gives up on a stalled request instead of hanging forever', async () => {
    const loki = await startLoki(() => {
      // never respond
    })
    const { transport, reported } = makeTransport(loki.url, { timeoutMs: 150 })

    transport.log(entry('{"msg":"a"}'), () => {})
    await transport.flush()

    expect(reported).toHaveLength(1)
    expect(reported[0]).toContain('timed out after 150ms')

    transport.close()
    await loki.close()
  })

  it('drops the oldest entries once the queue is full and reports the loss', async () => {
    const loki = await startLoki((_req, res) => res.writeHead(204).end())
    const { transport, reported } = makeTransport(loki.url, { maxQueueEntries: 2 })

    transport.log(entry('{"n":1}'), () => {})
    transport.log(entry('{"n":2}'), () => {})
    transport.log(entry('{"n":3}'), () => {})
    await transport.flush()

    const payload = JSON.parse(loki.received[0].body)
    const lines = payload.streams[0].values.map((v: [string, string]) => v[1])
    expect(lines).toEqual(['{"n":2}', '{"n":3}'])
    expect(reported.some((m) => m.includes('dropped 1 entries while the queue was full'))).toBe(
      true,
    )

    transport.close()
    await loki.close()
  })

  it('caps how many entries go into one request and keeps the rest queued', async () => {
    const loki = await startLoki((_req, res) => res.writeHead(204).end())
    const { transport } = makeTransport(loki.url, { maxEntriesPerRequest: 2 })

    for (const n of [1, 2, 3, 4, 5]) transport.log(entry(`{"n":${n}}`), () => {})
    await transport.flush()

    expect(loki.received).toHaveLength(1)
    let payload = JSON.parse(loki.received[0].body)
    expect(payload.streams[0].values.map((v: [string, string]) => v[1])).toEqual([
      '{"n":1}',
      '{"n":2}',
    ])

    await transport.flush()
    payload = JSON.parse(loki.received[1].body)
    expect(payload.streams[0].values.map((v: [string, string]) => v[1])).toEqual([
      '{"n":3}',
      '{"n":4}',
    ])

    transport.close()
    await loki.close()
  })

  it('drain() empties a backlog across several requests', async () => {
    const loki = await startLoki((_req, res) => res.writeHead(204).end())
    const { transport } = makeTransport(loki.url, { maxEntriesPerRequest: 2 })

    for (const n of [1, 2, 3, 4, 5]) transport.log(entry(`{"n":${n}}`), () => {})
    await transport.drain()

    expect(loki.received).toHaveLength(3)
    const sent = loki.received
      .flatMap((r) => JSON.parse(r.body).streams)
      .flatMap((s: { values: [string, string][] }) => s.values.map((v) => v[1]))
    expect(sent).toEqual(['{"n":1}', '{"n":2}', '{"n":3}', '{"n":4}', '{"n":5}'])

    transport.close()
    await loki.close()
  })

  it('drain() gives up rather than spinning when the backlog cannot be sent', async () => {
    const loki = await startLoki((_req, res) => res.writeHead(503).end('unavailable'))
    const { transport, reported } = makeTransport(loki.url, { maxEntriesPerRequest: 2 })

    for (const n of [1, 2, 3, 4, 5]) transport.log(entry(`{"n":${n}}`), () => {})
    await transport.drain()

    expect(reported[0]).toContain('HTTP 503')
    transport.close()
    await loki.close()
  })

  it('does not post anything when there is nothing queued', async () => {
    const loki = await startLoki((_req, res) => res.writeHead(204).end())
    const { transport } = makeTransport(loki.url)

    await transport.flush()

    expect(loki.received).toHaveLength(0)
    transport.close()
    await loki.close()
  })

  it('reports a connection failure rather than throwing into the caller', async () => {
    const loki = await startLoki((_req, res) => res.writeHead(204).end())
    const url = loki.url
    await loki.close()

    const { transport, reported } = makeTransport(url)
    transport.log(entry('{"msg":"a"}'), () => {})

    await expect(transport.flush()).resolves.toBeUndefined()
    expect(reported).toHaveLength(1)
    expect(reported[0]).toContain('dropped a batch of 1 entries')

    transport.close()
  })
})
