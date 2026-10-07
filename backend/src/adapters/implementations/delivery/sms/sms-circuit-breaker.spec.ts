import { describe, it, expect, vi } from 'vitest'
import type { ConfigService } from '@nestjs/config'
import { SmsCircuitBreaker } from './sms-circuit-breaker'
import { RedisCircuitBreaker } from '../../../../common/redis/circuit-breaker'
import { TransientDeliveryError } from '../../../delivery-errors'

vi.mock('../../../../queue/redis-connection', () => ({
  createRedisClient: vi.fn(() => ({ quit: vi.fn().mockResolvedValue('OK') })),
}))

const config = (redis: unknown) => ({ get: () => redis }) as unknown as ConfigService
const transport = () => ({ name: 'acs', send: vi.fn().mockResolvedValue({ messageId: 'm1' }) })

describe('SmsCircuitBreaker', () => {
  it('sends every SMS through the breaker, keeping the provider name', async () => {
    let isFailure: ((error: unknown) => boolean) | undefined
    const run = vi.spyOn(RedisCircuitBreaker.prototype, 'run').mockImplementation(function (
      this: RedisCircuitBreaker,
      fn,
    ) {
      isFailure = (this as unknown as { options: { isFailure: typeof isFailure } }).options
        .isFailure
      return fn()
    })
    const inner = transport()

    const wrapped = new SmsCircuitBreaker(config({ host: 'localhost', port: 6379 })).wrap(inner)

    await expect(wrapped.send({ to: '+15550000001', body: 'Hi' })).resolves.toEqual({
      messageId: 'm1',
    })
    expect(wrapped.name).toBe('acs')
    expect(run).toHaveBeenCalledTimes(1)
    // Only an outage counts against the provider, not a bad number.
    expect(isFailure?.(new TransientDeliveryError('503'))).toBe(true)
    expect(isFailure?.(new Error('Invalid number'))).toBe(false)
    run.mockRestore()
  })

  it('leaves the transport as it is without Redis', () => {
    const inner = transport()
    expect(new SmsCircuitBreaker(config(undefined)).wrap(inner)).toBe(inner)
  })
})
