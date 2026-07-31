export interface LimitAlertEvaluatorInput {
  channelCode: string
  alertsEnabled: boolean
  warnThresholdPercent: number
  dailyLimit: number | undefined
  annualLimit: number | undefined
  dayUsage: number | undefined
  yearUsage: number | undefined
}

export interface LimitAlertToFire {
  channelCode: string
  periodTypeCode: 'DAY' | 'YEAR'
  alertLevel: 'WARN' | 'LIMIT_REACHED'
  sentCount: number
  limit: number
  percent: number
}

export function evaluateLimitAlerts(input: LimitAlertEvaluatorInput): LimitAlertToFire[] {
  if (!input.alertsEnabled) return []

  const results: LimitAlertToFire[] = []
  const periods: Array<{
    periodTypeCode: 'DAY' | 'YEAR'
    limit: number | undefined
    usage: number | undefined
  }> = [
    {
      periodTypeCode: 'DAY',
      limit: input.dailyLimit,
      usage: input.dayUsage,
    },
    {
      periodTypeCode: 'YEAR',
      limit: input.annualLimit,
      usage: input.yearUsage,
    },
  ]

  for (const { periodTypeCode, limit, usage } of periods) {
    if (limit === undefined || limit <= 0 || usage === undefined) continue

    const rawPercent = (usage / limit) * 100
    const percent = Math.round(rawPercent * 100) / 100
    let alertLevel: LimitAlertToFire['alertLevel'] | undefined

    if (rawPercent >= 100) {
      alertLevel = 'LIMIT_REACHED'
    } else if (rawPercent >= input.warnThresholdPercent) {
      alertLevel = 'WARN'
    }

    if (alertLevel) {
      results.push({
        channelCode: input.channelCode,
        periodTypeCode,
        alertLevel,
        sentCount: usage,
        limit,
        percent,
      })
    }
  }

  return results
}
