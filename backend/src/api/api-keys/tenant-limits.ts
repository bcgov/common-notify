/**
 * A tenant's notification limits are tenant-wide but stored per (API key, channel), with every
 * key the tenant has carrying a copy. The admin edit writes the same values to all of them, so
 * they only differ when a row was changed some other way; taking the lowest keeps enforcement
 * conservative when they do. Summing them would multiply the allowance by the number of keys.
 */

export interface ChannelLimits {
  rateLimitPerMinute: number
  dailyLimit: number
  annualLimit: number
}

/** The tenant's limits per channel: the lowest of each value across the given limit rows. */
export function lowestLimitsByChannel(
  limits: Array<ChannelLimits & { channelCode: string }>,
): Map<string, ChannelLimits> {
  const byChannel = new Map<string, ChannelLimits>()
  for (const { channelCode, rateLimitPerMinute, dailyLimit, annualLimit } of limits) {
    const current = byChannel.get(channelCode)
    byChannel.set(
      channelCode,
      current
        ? {
            rateLimitPerMinute: Math.min(current.rateLimitPerMinute, rateLimitPerMinute),
            dailyLimit: Math.min(current.dailyLimit, dailyLimit),
            annualLimit: Math.min(current.annualLimit, annualLimit),
          }
        : { rateLimitPerMinute, dailyLimit, annualLimit },
    )
  }
  return byChannel
}

/** The tenant's warning threshold per channel: the lowest across the given alert-config rows. */
export function lowestThresholdsByChannel(
  alerts: Array<{ channelCode: string; warnThresholdPercent: number }>,
): Map<string, number> {
  const byChannel = new Map<string, number>()
  for (const { channelCode, warnThresholdPercent } of alerts) {
    const current = byChannel.get(channelCode)
    byChannel.set(
      channelCode,
      current === undefined ? warnThresholdPercent : Math.min(current, warnThresholdPercent),
    )
  }
  return byChannel
}
