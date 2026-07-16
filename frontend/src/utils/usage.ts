/** Shared helpers for the notification usage & limits screens. */

/** Title-case a channel code, e.g. EMAIL -> Email. */
export function formatChannel(channel: string): string {
  return channel.charAt(0).toUpperCase() + channel.slice(1).toLowerCase()
}

/** Usage as a percentage of a limit, rounded to five decimal places. */
export function percentOf(used: number, limit: number): number {
  if (!limit || limit <= 0) return 0
  return Math.round((used / limit) * 1e7) / 1e5
}
