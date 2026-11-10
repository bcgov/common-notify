import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { gzipSync } from 'zlib'
import axios from 'axios'
import {
  WEBHOOK_MAX_RESPONSE_BYTES,
  isBlockedAddressError,
  isOversizeResponseError,
  webhookRequestConfig,
} from './webhook-request'

// Real axios against a real socket: the point is that axios actually honours these options,
// which a mocked axios.post cannot show.
describe('webhookRequestConfig', () => {
  let server: Server
  let base: string
  let internalHit = false

  beforeAll(async () => {
    server = createServer((req, res) => {
      switch (req.url) {
        case '/redirect':
          res.writeHead(302, { Location: `${base}/internal` }).end()
          break
        case '/internal':
          internalHit = true
          res.end('internal')
          break
        case '/huge':
          res.end('x'.repeat(WEBHOOK_MAX_RESPONSE_BYTES + 1))
          break
        case '/gzip-bomb':
          res
            .writeHead(200, { 'Content-Encoding': 'gzip' })
            .end(gzipSync(Buffer.alloc(10 * WEBHOOK_MAX_RESPONSE_BYTES)))
          break
        default:
          res.end('ok')
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  // The test server is on loopback, which the filtering agents refuse.
  const unguarded = () => ({
    ...webhookRequestConfig(),
    httpAgent: undefined,
    httpsAgent: undefined,
  })

  it('does not follow a redirect', async () => {
    const error = await axios.post(`${base}/redirect`, {}, unguarded()).catch((e) => e)

    expect(error.response?.status).toBe(302)
    expect(internalHit).toBe(false)
  })

  it.each(['/huge', '/gzip-bomb'])('stops reading %s past the size cap', async (path) => {
    const error = await axios.post(`${base}${path}`, {}, unguarded()).catch((e) => e)

    expect(isOversizeResponseError(error)).toBe(true)
  })

  it('refuses a hostname that resolves to loopback', async () => {
    const url = base.replace('127.0.0.1', 'localhost')
    const error = await axios.post(`${url}/ok`, {}, webhookRequestConfig()).catch((e) => e)

    expect(isBlockedAddressError(error)).toBe(true)
    expect(internalHit).toBe(false)
  })

  // Refused before any socket opens, so these never touch the network.
  it.each([
    'https://10.0.0.1/hook',
    'https://172.30.0.1/hook', // OpenShift service network
    'https://10.128.4.5/hook', // OpenShift pod network
    'https://169.254.169.254/latest/meta-data', // cloud metadata
    'https://100.64.0.1/hook', // carrier-grade NAT
    'https://0.0.0.0/hook',
    'https://[::1]/hook',
    'https://[fd00::1]/hook',
    'https://[::ffff:10.0.0.1]/hook', // IPv4-mapped
    'http://127.0.0.1/hook',
  ])('refuses the IP literal in %s', async (url) => {
    const error = await axios.post(url, {}, webhookRequestConfig()).catch((e) => e)

    expect(isBlockedAddressError(error)).toBe(true)
  })

  // Only a refusal counts - an ordinary network failure must still be retried.
  it('does not mistake a connection error for a refusal', async () => {
    const spare = createServer()
    await new Promise<void>((resolve) => spare.listen(0, '127.0.0.1', resolve))
    const { port } = spare.address() as AddressInfo
    await new Promise<void>((resolve) => spare.close(() => resolve()))

    const closed = `http://127.0.0.1:${port}/`
    const error = await axios.post(closed, {}, unguarded()).catch((e) => e)

    expect(error.code).toBe('ECONNREFUSED')
    expect(isBlockedAddressError(error)).toBe(false)
  })
})
