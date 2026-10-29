import axios, { type AxiosRequestConfig } from 'axios'
import { RequestFilteringHttpAgent, RequestFilteringHttpsAgent } from 'request-filtering-agent'

export const WEBHOOK_TIMEOUT_MS = 30_000
export const WEBHOOK_MAX_RESPONSE_BYTES = 64 * 1024
/** How much of a response body is kept in webhook_delivery_log. */
export const WEBHOOK_LOGGED_BODY_CHARS = 4 * 1024

// Refuse to connect to anything but a public unicast address - private, loopback, link-local,
// cluster, IPv4-mapped and reserved ranges alike - whether the URL names it as an IP literal or
// a hostname resolves to it. The check runs at connect time, so DNS rebinding cannot slip past.
const httpAgent = new RequestFilteringHttpAgent()
const httpsAgent = new RequestFilteringHttpsAgent()

/**
 * Request options for a POST to a tenant-supplied URL. The URL is untrusted, so: no redirects
 * (a 302 to an internal host is the SSRF), only public addresses, a capped response (counted
 * after decompression), and a total deadline - `timeout` alone is an idle timer that a slow
 * trickle never trips. `proxy: false` because a proxy would connect for us, bypassing the agent.
 */
export function webhookRequestConfig(): AxiosRequestConfig {
  return {
    timeout: WEBHOOK_TIMEOUT_MS,
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    maxRedirects: 0,
    maxContentLength: WEBHOOK_MAX_RESPONSE_BYTES,
    maxBodyLength: WEBHOOK_MAX_RESPONSE_BYTES,
    httpAgent,
    httpsAgent,
    proxy: false,
  }
}

// request-filtering-agent rejects with a plain Error and no code, so its message is the only
// signal. webhook-request.spec.ts runs the real agent to catch a reworded message on upgrade.
const BLOCKED_ADDRESS_MESSAGE = /^DNS lookup .+ is not allowed\./

/** The agent refused the address. */
export function isBlockedAddressError(error: unknown): boolean {
  for (let e = error; e instanceof Error; e = e.cause) {
    if (BLOCKED_ADDRESS_MESSAGE.test(e.message)) return true
  }
  return false
}

/** The response body ran past WEBHOOK_MAX_RESPONSE_BYTES. */
export function isOversizeResponseError(error: unknown): boolean {
  return (
    axios.isAxiosError(error) &&
    error.code === axios.AxiosError.ERR_BAD_RESPONSE &&
    error.message.startsWith('maxContentLength')
  )
}
