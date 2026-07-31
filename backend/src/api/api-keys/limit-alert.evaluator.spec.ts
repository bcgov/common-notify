import {
  evaluateLimitAlerts,
  LimitAlertEvaluatorInput,
  LimitAlertToFire,
} from './limit-alert.evaluator'

describe('evaluateLimitAlerts', () => {
  const baseInput: LimitAlertEvaluatorInput = {
    channelCode: 'EMAIL',
    alertsEnabled: true,
    warnThresholdPercent: 80,
    dailyLimit: 100,
    annualLimit: 1000,
    dayUsage: 0,
    yearUsage: 0,
  }

  it('returns no alerts when alerts are disabled regardless of usage and limits', () => {
    const result = evaluateLimitAlerts({
      ...baseInput,
      alertsEnabled: false,
      dailyLimit: 0,
      annualLimit: 1,
      dayUsage: 100,
      yearUsage: 1000,
    })

    expect(result).toEqual([])
  })

  it('returns no alert when usage is just under the warning threshold', () => {
    const result = evaluateLimitAlerts({
      ...baseInput,
      dayUsage: 79.99,
    })

    expect(result).toEqual([])
  })

  it('fires WARN when usage is exactly at the warning threshold', () => {
    const result = evaluateLimitAlerts({
      ...baseInput,
      dayUsage: 80,
    })

    expect(result).toEqual<LimitAlertToFire[]>([
      {
        channelCode: 'EMAIL',
        periodTypeCode: 'DAY',
        alertLevel: 'WARN',
        sentCount: 80,
        limit: 100,
        percent: 80,
      },
    ])
  })

  it('fires WARN when usage is between the warning threshold and 100 percent', () => {
    const result = evaluateLimitAlerts({
      ...baseInput,
      dayUsage: 85.678,
    })

    expect(result).toEqual<LimitAlertToFire[]>([
      {
        channelCode: 'EMAIL',
        periodTypeCode: 'DAY',
        alertLevel: 'WARN',
        sentCount: 85.678,
        limit: 100,
        percent: 85.68,
      },
    ])
  })

  it.each([
    { usage: 100, percent: 100 },
    { usage: 125, percent: 125 },
  ])('fires only LIMIT_REACHED when usage is at or over 100 percent', ({ usage, percent }) => {
    const result = evaluateLimitAlerts({
      ...baseInput,
      dayUsage: usage,
    })

    expect(result).toEqual<LimitAlertToFire[]>([
      {
        channelCode: 'EMAIL',
        periodTypeCode: 'DAY',
        alertLevel: 'LIMIT_REACHED',
        sentCount: usage,
        limit: 100,
        percent,
      },
    ])
  })

  it('evaluates DAY and YEAR independently', () => {
    const result = evaluateLimitAlerts({
      ...baseInput,
      dayUsage: 85,
      yearUsage: 1000,
    })

    expect(result).toEqual<LimitAlertToFire[]>([
      {
        channelCode: 'EMAIL',
        periodTypeCode: 'DAY',
        alertLevel: 'WARN',
        sentCount: 85,
        limit: 100,
        percent: 85,
      },
      {
        channelCode: 'EMAIL',
        periodTypeCode: 'YEAR',
        alertLevel: 'LIMIT_REACHED',
        sentCount: 1000,
        limit: 1000,
        percent: 100,
      },
    ])
  })

  it.each([{ dailyLimit: undefined }, { dailyLimit: 0 }, { dailyLimit: -1 }])(
    'skips DAY when its limit is missing or non-positive',
    ({ dailyLimit }) => {
      const result = evaluateLimitAlerts({
        ...baseInput,
        dailyLimit,
        dayUsage: 100,
      })

      expect(result).toEqual([])
    },
  )

  it.each([{ annualLimit: undefined }, { annualLimit: 0 }, { annualLimit: -1 }])(
    'skips YEAR when its limit is missing or non-positive',
    ({ annualLimit }) => {
      const result = evaluateLimitAlerts({
        ...baseInput,
        annualLimit,
        yearUsage: 1000,
      })

      expect(result).toEqual([])
    },
  )

  it('skips DAY when day usage is missing', () => {
    const result = evaluateLimitAlerts({
      ...baseInput,
      dayUsage: undefined,
    })

    expect(result).toEqual([])
  })

  it('skips YEAR when year usage is missing', () => {
    const result = evaluateLimitAlerts({
      ...baseInput,
      yearUsage: undefined,
    })

    expect(result).toEqual([])
  })
  it('does not fire WARN when warning threshold exceeds 100', () => {
    const result = evaluateLimitAlerts({
      ...baseInput,
      warnThresholdPercent: 120,
      dayUsage: 110,
    })

    expect(result).toEqual([
      {
        channelCode: 'EMAIL',
        periodTypeCode: 'DAY',
        alertLevel: 'LIMIT_REACHED',
        sentCount: 110,
        limit: 100,
        percent: 110,
      },
    ])
  })
})
