// Headers a tenant may not set on their callback: ones that change where or how the request
// is routed or framed, that impersonate a proxy or the caller, or that forge our signature.
// Authorization is deliberately allowed - it is how a tenant authenticates us to their endpoint.
const BLOCKED_HEADERS = new Set([
  'host',
  'cookie',
  'forwarded',
  'x-real-ip',
  'x-webhook-signature',
  'connection',
  'content-length',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
  'expect',
  'keep-alive',
])
const BLOCKED_PREFIXES = ['x-forwarded-', 'proxy-']

export function isBlockedWebhookHeader(name: string): boolean {
  const lower = name.trim().toLowerCase()
  return BLOCKED_HEADERS.has(lower) || BLOCKED_PREFIXES.some((prefix) => lower.startsWith(prefix))
}

/** Drops blocked headers, for rows stored before registration enforced the list. */
export function allowedWebhookHeaders(
  headers: Record<string, string> | null | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).filter(([name]) => !isBlockedWebhookHeader(name)),
  )
}
