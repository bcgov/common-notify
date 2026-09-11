import { lowestLimitsByChannel, lowestThresholdsByChannel } from './tenant-limits'

describe('lowestLimitsByChannel', () => {
  it('takes the lowest of each value per channel rather than summing across keys', () => {
    const result = lowestLimitsByChannel([
      { channelCode: 'EMAIL', rateLimitPerMinute: 1000, dailyLimit: 300_010, annualLimit: 20 },
      {
        channelCode: 'EMAIL',
        rateLimitPerMinute: 500,
        dailyLimit: 100_000,
        annualLimit: 20_000_000,
      },
      { channelCode: 'SMS', rateLimitPerMinute: 1000, dailyLimit: 10_000, annualLimit: 100_000 },
    ])

    expect(result.get('EMAIL')).toEqual({
      rateLimitPerMinute: 500,
      dailyLimit: 100_000,
      annualLimit: 20,
    })
    expect(result.get('SMS')).toEqual({
      rateLimitPerMinute: 1000,
      dailyLimit: 10_000,
      annualLimit: 100_000,
    })
  })

  it('returns no channels for no limit rows', () => {
    expect(lowestLimitsByChannel([]).size).toBe(0)
  })
})

describe('lowestThresholdsByChannel', () => {
  it('takes the lowest threshold per channel', () => {
    const result = lowestThresholdsByChannel([
      { channelCode: 'EMAIL', warnThresholdPercent: 90 },
      { channelCode: 'EMAIL', warnThresholdPercent: 60 },
      { channelCode: 'SMS', warnThresholdPercent: 80 },
    ])

    expect(result.get('EMAIL')).toBe(60)
    expect(result.get('SMS')).toBe(80)
  })
})
