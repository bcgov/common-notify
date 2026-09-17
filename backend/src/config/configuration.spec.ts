import { afterEach, describe, expect, it, vi } from 'vitest'
import configuration from './configuration'

const NUMERIC_ENV = [
  'PORT',
  'REDIS_PORT',
  'REDIS_DB',
  'APS_TIMEOUT_MS',
  'CSTAR_USER_TENANTS_CACHE_TTL_MS',
  'CLAMAV_PORT',
  'CLAMAV_TIMEOUT',
  'INGESTION_WORKER_CONCURRENCY',
  'BATCH_SIZE',
  'EMAIL_DELIVERY_WORKER_CONCURRENCY',
  'SMS_DELIVERY_WORKER_CONCURRENCY',
  'JOB_RETRIES',
  'JOB_BACKOFF_DELAY',
  'PENDING_RETRY_INTERVAL',
]

describe('configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('falls back to numeric defaults when the variables are unset', () => {
    for (const name of NUMERIC_ENV) vi.stubEnv(name, '')

    const config = configuration()

    expect(config.port).toBe(3000)
    expect(config.redis).toMatchObject({ port: 6379, db: 0 })
    expect(config.aps.timeoutMs).toBe(15000)
    expect(config.cstar.userTenantsCacheTtlMs).toBe(15000)
    expect(config.clamav).toMatchObject({ port: 3310, timeout: 30000 })
    expect(config.queue).toMatchObject({
      ingestionWorkerConcurrency: 1,
      batchSize: 100,
      emailDeliveryWorkerConcurrency: 20,
      smsDeliveryWorkerConcurrency: 2,
      jobRetries: 3,
      jobBackoffDelay: 2000,
      pendingRetryInterval: 30000,
    })
  })

  it('parses numeric variables as base-10 integers', () => {
    for (const name of NUMERIC_ENV) vi.stubEnv(name, '0042')

    const config = configuration()

    expect(config.port).toBe(42)
    expect(config.redis).toMatchObject({ port: 42, db: 42 })
    expect(config.aps.timeoutMs).toBe(42)
    expect(config.cstar.userTenantsCacheTtlMs).toBe(42)
    expect(config.clamav).toMatchObject({ port: 42, timeout: 42 })
    expect(config.queue).toMatchObject({
      ingestionWorkerConcurrency: 42,
      batchSize: 42,
      emailDeliveryWorkerConcurrency: 42,
      smsDeliveryWorkerConcurrency: 42,
      jobRetries: 42,
      jobBackoffDelay: 42,
      pendingRetryInterval: 42,
    })
  })
})
