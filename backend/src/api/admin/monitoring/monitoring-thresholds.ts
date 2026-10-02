const intFromEnv = (name: string, fallback: number): number => {
  const value = parseInt(process.env[name] || '', 10)
  return Number.isFinite(value) ? value : fallback
}

/**
 * Where the queue monitoring page turns amber and red. Redis is capped with `noeviction`, so
 * once memory is full every enqueue fails - the memory thresholds leave room to react first.
 */
export const MONITORING_THRESHOLDS = {
  redisMemoryWarningPercent: intFromEnv('MONITORING_REDIS_MEMORY_WARNING_PERCENT', 70),
  redisMemoryCriticalPercent: intFromEnv('MONITORING_REDIS_MEMORY_CRITICAL_PERCENT', 85),
  oldestWaitingWarningMs: intFromEnv('MONITORING_OLDEST_WAITING_WARNING_SECONDS', 120) * 1000,
  oldestWaitingCriticalMs: intFromEnv('MONITORING_OLDEST_WAITING_CRITICAL_SECONDS', 600) * 1000,
  failureRateWarningPercent: intFromEnv('MONITORING_FAILURE_RATE_WARNING_PERCENT', 5),
  failureRateCriticalPercent: intFromEnv('MONITORING_FAILURE_RATE_CRITICAL_PERCENT', 25),
  /** Whole minutes averaged for in/out rates; the current partial minute is excluded. */
  rateWindowMinutes: 5,
}
