/**
 * An SMS body as sent: prefixed with the sending tenant's name when its "Include tenant name in
 * SMS" setting is on, so recipients can tell who it is from. One helper for every place that sends,
 * counts or previews a body, so billing and previews match what goes on the wire.
 */
export function withSmsSenderName(
  body: string | undefined,
  senderName: string | null,
): string | undefined {
  if (!senderName || body === undefined) return body
  return `${senderName}: ${body}`
}
