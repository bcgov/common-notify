import { describe, expect, it } from 'vitest'
import { buildRedisOptions, type RedisConfig } from './redis-connection'

const base: RedisConfig = {
  host: 'common-notify-redis-master',
  port: 6379,
  db: 0,
}

describe('buildRedisOptions', () => {
  it('uses host and port when no sentinels are configured', () => {
    expect(buildRedisOptions(base)).toEqual({
      host: 'common-notify-redis-master',
      port: 6379,
      db: 0,
    })
  })

  it('omits password when unset', () => {
    expect(buildRedisOptions(base)).not.toHaveProperty('password')
  })

  it('includes password when set', () => {
    expect(buildRedisOptions({ ...base, password: 'secret' })).toMatchObject({ password: 'secret' })
  })

  it('switches to sentinel discovery when sentinels are configured', () => {
    const options = buildRedisOptions({
      ...base,
      sentinels: [
        { host: 'node-0', port: 26379 },
        { host: 'node-1', port: 26379 },
      ],
      masterName: 'mymaster',
    })
    expect(options).toMatchObject({
      sentinels: [
        { host: 'node-0', port: 26379 },
        { host: 'node-1', port: 26379 },
      ],
      name: 'mymaster',
      db: 0,
    })
  })

  it('does not pin host or port in sentinel mode', () => {
    const options = buildRedisOptions({
      ...base,
      sentinels: [{ host: 'node-0', port: 26379 }],
    })
    expect(options).not.toHaveProperty('host')
    expect(options).not.toHaveProperty('port')
  })

  it('defaults the master group name when not supplied', () => {
    const options = buildRedisOptions({
      ...base,
      sentinels: [{ host: 'node-0', port: 26379 }],
    })
    expect(options.name).toBe('mymaster')
  })

  it('falls back to host and port when the sentinel list is empty', () => {
    const options = buildRedisOptions({ ...base, sentinels: [] })
    expect(options).toMatchObject({ host: 'common-notify-redis-master', port: 6379 })
    expect(options).not.toHaveProperty('sentinels')
  })

  it('passes sentinelPassword through only when set', () => {
    const withoutPassword = buildRedisOptions({
      ...base,
      sentinels: [{ host: 'node-0', port: 26379 }],
    })
    expect(withoutPassword).not.toHaveProperty('sentinelPassword')

    const withPassword = buildRedisOptions({
      ...base,
      sentinels: [{ host: 'node-0', port: 26379 }],
      sentinelPassword: 'sentinel-secret',
    })
    expect(withPassword).toMatchObject({ sentinelPassword: 'sentinel-secret' })
  })

  it('lets overrides win over derived options', () => {
    const options = buildRedisOptions(base, { db: 3, maxRetriesPerRequest: null })
    expect(options).toMatchObject({ db: 3, maxRetriesPerRequest: null })
  })
})
