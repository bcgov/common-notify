import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import configuration from './configuration'

/**
 * `parseSentinels` is module-private, so it is exercised through the config
 * factory via REDIS_SENTINELS. Sentinel entries arrive as a comma-separated
 * `host:port` list from the Helm chart, where the port may be absent or
 * malformed, so each of those shapes is pinned here.
 */
const sentinelsOf = (value?: string) => {
  if (value === undefined) delete process.env.REDIS_SENTINELS
  else process.env.REDIS_SENTINELS = value
  return configuration().redis.sentinels
}

describe('configuration redis.sentinels', () => {
  const original = process.env.REDIS_SENTINELS

  beforeEach(() => {
    delete process.env.REDIS_SENTINELS
  })

  afterEach(() => {
    if (original === undefined) delete process.env.REDIS_SENTINELS
    else process.env.REDIS_SENTINELS = original
  })

  it('is undefined when REDIS_SENTINELS is unset, so the client uses host/port', () => {
    expect(sentinelsOf(undefined)).toBeUndefined()
  })

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
  ])('is undefined when REDIS_SENTINELS is %s', (_label, value) => {
    expect(sentinelsOf(value)).toBeUndefined()
  })

  it('parses a single host:port entry', () => {
    expect(sentinelsOf('redis-node-0:26379')).toEqual([{ host: 'redis-node-0', port: 26379 }])
  })

  it('parses several entries and trims surrounding whitespace', () => {
    expect(sentinelsOf('redis-node-0:26379, redis-node-1:26380 ,redis-node-2:26381')).toEqual([
      { host: 'redis-node-0', port: 26379 },
      { host: 'redis-node-1', port: 26380 },
      { host: 'redis-node-2', port: 26381 },
    ])
  })

  it('drops empty entries from a trailing or doubled comma', () => {
    expect(sentinelsOf('redis-node-0:26379,,redis-node-1:26380,')).toEqual([
      { host: 'redis-node-0', port: 26379 },
      { host: 'redis-node-1', port: 26380 },
    ])
  })

  it('defaults the port to 26379 when an entry has no port', () => {
    expect(sentinelsOf('redis-node-0')).toEqual([{ host: 'redis-node-0', port: 26379 }])
  })

  it('defaults the port to 26379 when the port is not a number', () => {
    expect(sentinelsOf('redis-node-0:not-a-port')).toEqual([{ host: 'redis-node-0', port: 26379 }])
  })

  it('splits on the last colon, so an IPv6 host keeps its colons', () => {
    expect(sentinelsOf('::1:26379')).toEqual([{ host: '::1', port: 26379 }])
  })

  it('is undefined when every entry is dropped for having no host', () => {
    expect(sentinelsOf(':26379, :26380')).toBeUndefined()
  })

  it('keeps the valid entries when only some are hostless', () => {
    expect(sentinelsOf(':26379,redis-node-1:26380')).toEqual([
      { host: 'redis-node-1', port: 26380 },
    ])
  })
})

describe('configuration smsNumbers.defaultNumberAssignable', () => {
  const original = process.env.NAMESPACE

  afterEach(() => {
    if (original === undefined) delete process.env.NAMESPACE
    else process.env.NAMESPACE = original
  })

  it.each([
    ['f6bc3f-dev', true],
    ['f6bc3f-test', true],
    ['f6bc3f-prod', false],
  ])('in %s is %s', (namespace, expected) => {
    process.env.NAMESPACE = namespace
    expect(configuration().smsNumbers.defaultNumberAssignable).toBe(expected)
  })

  it('is true running locally, with no namespace', () => {
    delete process.env.NAMESPACE
    expect(configuration().smsNumbers.defaultNumberAssignable).toBe(true)
  })
})

describe('configuration delivery.environmentPrefix', () => {
  const original = process.env.ENVIRONMENT

  afterEach(() => {
    if (original === undefined) delete process.env.ENVIRONMENT
    else process.env.ENVIRONMENT = original
  })

  it.each([
    ['DEV', '[DEV]'],
    ['TEST', '[TEST]'],
    ['PROD', ''],
    ['dev', '[DEV]'],
    ['local', ''],
  ])('with ENVIRONMENT=%s is "%s"', (environment, expected) => {
    process.env.ENVIRONMENT = environment
    expect(configuration().delivery.environmentPrefix).toBe(expected)
  })

  it('is empty when ENVIRONMENT is unset', () => {
    delete process.env.ENVIRONMENT
    expect(configuration().delivery.environmentPrefix).toBe('')
  })
})
