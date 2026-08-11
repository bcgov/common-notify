/**
 * Derive the API route that accepted the request, relative to the versioned global prefix.
 * Uses the matched Express route pattern (falling back to the request path) and strips the
 * leading `/api/v{n}/` so the stored value is e.g. `notifysimple`, `notifysimple/email`.
 */
export function extractRequestRoute(req: any): string | undefined {
  const raw: string | undefined = req?.route?.path ?? req?.path ?? req?.originalUrl
  if (typeof raw !== 'string') return undefined
  const route =
    '/' +
    raw
      .split('?')[0]
      .replace(/^\/?api\/v\d+\//i, '')
      .replace(/^\/+|\/+$/g, '')
  return route || undefined
}
