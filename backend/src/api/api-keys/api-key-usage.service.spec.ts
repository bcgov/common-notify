import { In, Repository } from 'typeorm'
import { vi } from 'vitest'
import { UsagePeriodType } from '../../enum/usage-period-type.enum'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import { ApiKeyConsumer } from './entities/api-key-consumer.entity'
import { ApiKeyLimit } from './entities/api-key-limit.entity'
import { ApiKeyLimitAlert } from './entities/api-key-limit-alert.entity'
import { ApiKeyUsage } from './entities/api-key-usage.entity'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import {
  ApiKeyUsageService,
  averageMonthlySends,
  averageWindow,
  channelsInScope,
} from './api-key-usage.service'
import type { ListQueryFilter, ParsedListQuery } from '../../common/query/list-query.types'

describe('ApiKeyUsageService.recordUsage', () => {
  const apiKeyUsageRepository = {
    query: vi.fn(),
  }
  const configurationRepository = {
    findOne: vi.fn(),
  }

  const service = new ApiKeyUsageService(
    {} as Repository<ApiKeyConsumer>,
    {} as Repository<ApiKeyLimit>,
    {} as Repository<ApiKeyLimitAlert>,
    apiKeyUsageRepository as unknown as Repository<ApiKeyUsage>,
    configurationRepository as unknown as Repository<NotifyConfiguration>,
    {} as Repository<Tenant>,
  )

  beforeEach(() => {
    vi.clearAllMocks()
    configurationRepository.findOne.mockResolvedValue(null)
  })

  it('returns exact DAY and YEAR period starts from the upsert result', async () => {
    const minuteStart = new Date('2026-07-29T23:59:00.000Z')
    const dayStartNearBoundary = '2026-07-29T00:00:00.000Z'
    const fiscalYearStart = new Date('2026-04-01T00:00:00.000Z')
    apiKeyUsageRepository.query
      .mockResolvedValueOnce([
        {
          period_type_code: UsagePeriodType.MINUTE,
          period_start: minuteStart,
          sent_count: '11',
        },
        {
          period_type_code: UsagePeriodType.DAY,
          period_start: dayStartNearBoundary,
          sent_count: '85',
        },
        {
          period_type_code: UsagePeriodType.YEAR,
          period_start: fiscalYearStart,
          sent_count: '1000',
        },
      ])
      .mockResolvedValueOnce([])

    const result = await service.recordUsage('consumer-1', 'EMAIL', 1)

    expect(apiKeyUsageRepository.query.mock.calls[0][0]).toContain(
      'RETURNING period_type_code, period_start, sent_count',
    )
    expect(result).toEqual([
      {
        periodTypeCode: UsagePeriodType.DAY,
        periodStart: new Date(dayStartNearBoundary),
        sentCount: 85,
      },
      {
        periodTypeCode: UsagePeriodType.YEAR,
        periodStart: fiscalYearStart,
        sentCount: 1_000,
      },
    ])
    expect(result.every(({ periodStart }) => periodStart instanceof Date)).toBe(true)
  })

  it("returns the tenant's totals across all of its keys, not just the sending key's", async () => {
    const dayStart = new Date('2026-07-29T00:00:00.000Z')
    const fiscalYearStart = new Date('2026-04-01T00:00:00.000Z')
    apiKeyUsageRepository.query
      .mockResolvedValueOnce([
        { period_type_code: UsagePeriodType.DAY, period_start: dayStart, sent_count: '5' },
        { period_type_code: UsagePeriodType.YEAR, period_start: fiscalYearStart, sent_count: '20' },
      ])
      .mockResolvedValueOnce([
        { period_type_code: UsagePeriodType.DAY, sent_count: '42' },
        { period_type_code: UsagePeriodType.YEAR, sent_count: '85' },
      ])

    const result = await service.recordUsage('consumer-1', 'EMAIL', 1)

    const [totalsSql, totalsParams] = apiKeyUsageRepository.query.mock.calls[1]
    expect(totalsSql).toContain('c.tenant_id')
    expect(totalsParams).toEqual(['consumer-1', 'EMAIL', dayStart, fiscalYearStart])
    expect(result).toEqual([
      { periodTypeCode: UsagePeriodType.DAY, periodStart: dayStart, sentCount: 42 },
      { periodTypeCode: UsagePeriodType.YEAR, periodStart: fiscalYearStart, sentCount: 85 },
    ])
  })
})

describe('ApiKeyUsageService.assertWithinLimits', () => {
  const apiKeyConsumerRepository = { findOne: vi.fn(), find: vi.fn() }
  const apiKeyLimitRepository = { find: vi.fn() }
  const configurationRepository = { findOne: vi.fn() }
  const usageQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    addGroupBy: vi.fn().mockReturnThis(),
    getRawMany: vi.fn(),
  }
  const apiKeyUsageRepository = {
    createQueryBuilder: vi.fn(() => usageQueryBuilder),
  }

  const service = new ApiKeyUsageService(
    apiKeyConsumerRepository as unknown as Repository<ApiKeyConsumer>,
    apiKeyLimitRepository as unknown as Repository<ApiKeyLimit>,
    {} as Repository<ApiKeyLimitAlert>,
    apiKeyUsageRepository as unknown as Repository<ApiKeyUsage>,
    configurationRepository as unknown as Repository<NotifyConfiguration>,
    {} as Repository<Tenant>,
  )

  /** Tenant has a 100/day SMS limit with `usedToday` already spent. */
  const withDailyUsage = (usedToday: number) => {
    apiKeyLimitRepository.find.mockResolvedValue([
      { channelCode: 'SMS', dailyLimit: 100, annualLimit: 100_000 },
    ])
    usageQueryBuilder.getRawMany.mockResolvedValue([
      { channelCode: 'SMS', periodTypeCode: UsagePeriodType.DAY, total: String(usedToday) },
      { channelCode: 'SMS', periodTypeCode: UsagePeriodType.YEAR, total: String(usedToday) },
    ])
  }

  beforeEach(() => {
    vi.clearAllMocks()
    configurationRepository.findOne.mockResolvedValue(null)
    apiKeyConsumerRepository.findOne.mockResolvedValue({ id: 'consumer-1', tenantId: 'tenant-1' })
    apiKeyConsumerRepository.find.mockResolvedValue([{ id: 'consumer-1' }])
  })

  it("counts every key's usage against the tenant's lowest limit, not a sum of limits", async () => {
    // Two keys at 100/day and 300/day: the tenant's limit is 100, not 400.
    apiKeyConsumerRepository.find.mockResolvedValue([{ id: 'consumer-1' }, { id: 'consumer-2' }])
    apiKeyLimitRepository.find.mockResolvedValue([
      { channelCode: 'EMAIL', dailyLimit: 100, annualLimit: 1_000_000 },
      { channelCode: 'EMAIL', dailyLimit: 300, annualLimit: 1_000_000 },
    ])
    usageQueryBuilder.getRawMany.mockResolvedValue([
      { channelCode: 'EMAIL', periodTypeCode: UsagePeriodType.DAY, total: '100' },
      { channelCode: 'EMAIL', periodTypeCode: UsagePeriodType.YEAR, total: '100' },
    ])

    await expect(
      service.assertWithinLimits('consumer-1', [{ channel: 'EMAIL', count: 1 }]),
    ).rejects.toMatchObject({
      response: { statusCode: 429, message: expect.stringContaining('Limit 100, used 100') },
    })
    expect(apiKeyLimitRepository.find).toHaveBeenCalledWith({
      where: { apiKeyConsumerId: In(['consumer-1', 'consumer-2']), channelCode: In(['EMAIL']) },
    })
    expect(usageQueryBuilder.where).toHaveBeenCalledWith(
      'u.api_key_consumer_id IN (:...consumerIds)',
      { consumerIds: ['consumer-1', 'consumer-2'] },
    )
  })

  it('fails open when the API key is not bound to a tenant', async () => {
    apiKeyConsumerRepository.findOne.mockResolvedValue(null)

    await expect(
      service.assertWithinLimits('consumer-1', [{ channel: 'EMAIL', count: 1 }]),
    ).resolves.toBeUndefined()
    expect(apiKeyLimitRepository.find).not.toHaveBeenCalled()
  })

  it('rejects a multi-segment SMS that does not fit in the remaining allowance', async () => {
    // 99 of 100 used: one message left, but this SMS costs three.
    withDailyUsage(99)

    await expect(
      service.assertWithinLimits('consumer-1', [
        {
          channel: 'SMS',
          count: 3,
          countExplanation: '1 recipient(s) x 3 segments, because the message is too long',
        },
      ]),
    ).rejects.toMatchObject({
      response: {
        statusCode: 429,
        message: expect.stringContaining('1 recipient(s) x 3 segments'),
      },
    })
  })

  it('accepts a multi-segment SMS that exactly fills the remaining allowance', async () => {
    withDailyUsage(97)

    await expect(
      service.assertWithinLimits('consumer-1', [{ channel: 'SMS', count: 3 }]),
    ).resolves.toBeUndefined()
  })

  it('reports the segment-inflated request count in the error, not the recipient count', async () => {
    withDailyUsage(99)

    await expect(
      service.assertWithinLimits('consumer-1', [{ channel: 'SMS', count: 3 }]),
    ).rejects.toMatchObject({
      response: { message: expect.stringContaining('requested 3') },
    })
  })
})

describe('ApiKeyUsageService.getAllTenantsUsage', () => {
  /** A query builder that records its where clauses and answers with the given result. */
  function fakeQueryBuilder(result: { many?: unknown[]; manyAndCount?: [unknown[], number] }) {
    const where: Array<[string, Record<string, unknown> | undefined]> = []
    const calls: Record<string, unknown[]> = {}
    const qb: Record<string, unknown> = new Proxy(
      {},
      {
        get(_, prop: string) {
          if (prop === 'where' || prop === 'andWhere') {
            return (clause: string, params?: Record<string, unknown>) => {
              where.push([clause, params])
              return qb
            }
          }
          if (prop === 'getRawMany') return () => Promise.resolve(result.many ?? [])
          if (prop === 'getManyAndCount') return () => Promise.resolve(result.manyAndCount)
          return (...args: unknown[]) => {
            calls[prop] = args
            return qb
          }
        },
      },
    )
    return { qb, where, calls }
  }

  const active = {
    status: 'active',
    disabledReason: null,
    disabledAt: null,
    disabledBy: null,
    disabledByName: null,
  }
  const parks = { id: 't-1', name: 'Parks', ...active }
  const roads = {
    id: 't-2',
    name: 'Roads',
    status: 'disabled',
    disabledReason: 'Unpaid invoice',
    disabledAt: new Date('2026-11-01T16:00:00.000Z'),
    disabledBy: 'padmin',
    disabledByName: 'Pat Admin',
  }
  const parksSmsLimit = {
    tenantId: 't-1',
    channelCode: 'SMS',
    rateLimitPerMinute: '1000',
    dailyLimit: '500',
    annualLimit: '10000',
    warnThresholdPercent: null,
  }

  function setup({
    tenants = [parks, roads],
    total = tenants.length,
    limits = [parksSmsLimit],
    usage = [{ tenantId: 't-1', channelCode: 'SMS', periodTypeCode: 'DAY', total: '42' }],
    history = [
      {
        tenant_id: 't-1',
        channel: 'SMS',
        last_sent_at: new Date('2026-11-03T17:20:00.000Z'),
        first_sent_at: new Date('2020-01-01T00:00:00.000Z'),
        window_count: '1200',
        recent_count: '310',
        recent_failed: '4',
      },
    ],
  } = {}) {
    const tenantQb = fakeQueryBuilder({ manyAndCount: [tenants, total] })
    const limitQb = fakeQueryBuilder({ many: limits })
    const usageQb = fakeQueryBuilder({ many: usage })
    const tenantRepository = {
      createQueryBuilder: vi.fn().mockReturnValue(tenantQb.qb),
      query: vi.fn().mockResolvedValue(history),
    }
    const service = new ApiKeyUsageService(
      {} as Repository<ApiKeyConsumer>,
      {
        createQueryBuilder: vi.fn().mockReturnValue(limitQb.qb),
      } as unknown as Repository<ApiKeyLimit>,
      {} as Repository<ApiKeyLimitAlert>,
      {
        createQueryBuilder: vi.fn().mockReturnValue(usageQb.qb),
      } as unknown as Repository<ApiKeyUsage>,
      { findOne: vi.fn().mockResolvedValue(null) } as unknown as Repository<NotifyConfiguration>,
      tenantRepository as unknown as Repository<Tenant>,
    )
    return { service, tenantRepository, tenantQb, limitQb, usageQb }
  }

  const parsed = (
    filters: ParsedListQuery['filters'] = [],
    paging = { page: 1, limit: 15, skip: 0 },
  ): ParsedListQuery => ({ ...paging, sorts: [], filters })
  const smsOnly = [{ field: 'channel', operator: 'in' as const, value: ['SMS'] }]

  it('lists every active CSTAR tenant, not only those with an API key', async () => {
    const { service, tenantQb } = setup()

    const result = await service.getAllTenantsUsage(parsed())

    // Disabled tenants are listed too, so an admin can see them and turn sending back on.
    expect(tenantQb.where.map(([clause]) => clause)).toEqual([
      't.isDeleted = :deleted',
      't.externalId IS NOT NULL',
    ])
    expect(result.count).toBe(2)
    expect(result.data.map((row) => [row.tenantName, row.channel])).toEqual([
      ['Parks', 'EMAIL'],
      ['Parks', 'SMS'],
      ['Roads', 'EMAIL'],
      ['Roads', 'SMS'],
    ])
  })

  it('shows zero usage and no limits on a channel the tenant has no limit for', async () => {
    const { service } = setup()

    const { data } = await service.getAllTenantsUsage(parsed())

    expect(data.find((row) => row.tenantId === 't-2' && row.channel === 'SMS')).toEqual({
      tenantId: 't-2',
      tenantName: 'Roads',
      channel: 'SMS',
      sendingEnabled: false,
      disabledReason: 'Unpaid invoice',
      disabledAt: '2026-11-01T16:00:00.000Z',
      disabledBy: 'Pat Admin',
      rateLimitPerMinute: null,
      dailyLimit: null,
      annualLimit: null,
      warnThresholdPercent: null,
      usedThisMinute: 0,
      usedToday: 0,
      usedThisYear: 0,
      lastSentAt: null,
      averageMonthlySends: null,
      recipientsLast30Days: 0,
      failedLast30Days: 0,
    })
    expect(data.find((row) => row.tenantId === 't-1' && row.channel === 'SMS')).toMatchObject({
      dailyLimit: 500,
      annualLimit: 10000,
      warnThresholdPercent: 80,
      usedToday: 42,
      lastSentAt: '2026-11-03T17:20:00.000Z',
      averageMonthlySends: 100,
      recipientsLast30Days: 310,
      failedLast30Days: 4,
    })
  })

  it('counts failures over the last 30 days by the failed status only', async () => {
    const { service, tenantRepository } = setup()

    await service.getAllTenantsUsage(parsed())

    const [, params] = tenantRepository.query.mock.calls[0] as [string, unknown[]]
    const since = params[4] as Date
    expect(Date.now() - since.getTime()).toBeCloseTo(30 * 24 * 60 * 60 * 1000, -4)
    expect(params[5]).toBe('failed')
  })

  it('keeps every tenant when filtered by channel, narrowing only their rows', async () => {
    const { service, tenantQb, limitQb, usageQb } = setup()

    const result = await service.getAllTenantsUsage(parsed(smsOnly))

    expect(tenantQb.where.some(([clause]) => clause.includes('channel'))).toBe(false)
    expect(result.count).toBe(2)
    expect(result.data.map((row) => [row.tenantName, row.channel])).toEqual([
      ['Parks', 'SMS'],
      ['Roads', 'SMS'],
    ])
    for (const { where } of [limitQb, usageQb]) {
      expect(where).toContainEqual(
        expect.arrayContaining([expect.any(String), { channels: ['SMS'] }]),
      )
    }
  })

  it('searches tenant names with the trimmed term and pages by tenant', async () => {
    const { service, tenantQb } = setup({ total: 32 })

    const result = await service.getAllTenantsUsage(
      parsed([], { page: 3, limit: 15, skip: 30 }),
      ' parks ',
    )

    expect(tenantQb.where).toContainEqual(['t.name ILIKE :search', { search: '%parks%' }])
    expect(tenantQb.calls.skip).toEqual([30])
    expect(tenantQb.calls.take).toEqual([15])
    expect(result).toMatchObject({ count: 32, page: 3, totalPages: 3 })
  })

  it('filters tenants by sending status, leaving the channel filter to pick rows', async () => {
    const { service, tenantQb } = setup()

    await service.getAllTenantsUsage(
      parsed([...smsOnly, { field: 'status', operator: 'in', value: ['disabled'] }]),
    )

    expect(tenantQb.where).toContainEqual([
      'LOWER(t.status) IN (:...filter_0)',
      { filter_0: ['disabled'] },
    ])
    expect(tenantQb.where.some(([clause]) => clause.includes('channel'))).toBe(false)
  })

  it('returns no rows without querying limits when no tenant matches', async () => {
    const { service, limitQb } = setup({ tenants: [] })

    const result = await service.getAllTenantsUsage(parsed())

    expect(result).toEqual({ data: [], count: 0, page: 1, limit: 15, totalPages: 0 })
    expect(limitQb.where).toEqual([])
  })
})

describe('ApiKeyUsageService.updateTenantLimits', () => {
  it("returns the edited channel's row under the tenant's name", async () => {
    const limitRepository = {
      update: vi.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: vi.fn(() => rawQb([])),
    }
    const rawQb = (rows: unknown[]): Record<string, unknown> =>
      new Proxy(
        {},
        {
          get: (_, prop: string) =>
            prop === 'getRawMany' ? () => Promise.resolve(rows) : () => rawQb(rows),
        },
      )
    const service = new ApiKeyUsageService(
      {
        find: vi.fn().mockResolvedValue([{ id: 'consumer-1' }]),
      } as unknown as Repository<ApiKeyConsumer>,
      limitRepository as unknown as Repository<ApiKeyLimit>,
      {} as Repository<ApiKeyLimitAlert>,
      { createQueryBuilder: () => rawQb([]) } as unknown as Repository<ApiKeyUsage>,
      { findOne: vi.fn().mockResolvedValue(null) } as unknown as Repository<NotifyConfiguration>,
      {
        findOneBy: vi.fn().mockResolvedValue({ id: 't-1', name: 'Parks' }),
        query: vi.fn().mockResolvedValue([]),
      } as unknown as Repository<Tenant>,
    )

    const rows = await service.updateTenantLimits('t-1', 'SMS', 10, 100)

    expect(rows).toEqual([expect.objectContaining({ tenantName: 'Parks', channel: 'SMS' })])
  })
})

describe('ApiKeyUsageService.getAdminUsageSummary', () => {
  it('counts Notify tenants, those sending this fiscal year and those with an API key', async () => {
    const where: string[] = []
    const params: Record<string, unknown> = {}
    const qb: Record<string, unknown> = new Proxy(
      {},
      {
        get(_, prop: string) {
          if (prop === 'where' || prop === 'andWhere')
            return (clause: string) => {
              where.push(clause)
              return qb
            }
          if (prop === 'setParameter')
            return (key: string, value: unknown) => {
              params[key] = value
              return qb
            }
          if (prop === 'getRawOne')
            return () =>
              Promise.resolve({
                tenants: '42',
                sentThisFiscalYear: '30',
                withApiKey: '12',
                disabled: '2',
              })
          return () => qb
        },
      },
    )
    const service = new ApiKeyUsageService(
      {} as Repository<ApiKeyConsumer>,
      {} as Repository<ApiKeyLimit>,
      {} as Repository<ApiKeyLimitAlert>,
      {} as Repository<ApiKeyUsage>,
      { findOne: vi.fn().mockResolvedValue(null) } as unknown as Repository<NotifyConfiguration>,
      { createQueryBuilder: () => qb } as unknown as Repository<Tenant>,
    )

    const summary = await service.getAdminUsageSummary()

    expect(summary).toEqual({ tenants: 42, sentThisFiscalYear: 30, withApiKey: 12, disabled: 2 })
    // The same tenants the usage table lists, and no search or filter.
    expect(where).toEqual(['t.isDeleted = :deleted', 't.externalId IS NOT NULL'])
    expect(params.fiscalYearStart).toBeInstanceOf(Date)
  })
})

describe('ApiKeyUsageService.listNotifyTenants', () => {
  it('lists the CSTAR tenants the usage table shows, by name, as id and name only', async () => {
    const where: string[] = []
    const calls: Record<string, unknown[]> = {}
    const qb: Record<string, unknown> = new Proxy(
      {},
      {
        get(_, prop: string) {
          if (prop === 'getMany') {
            return () => Promise.resolve([{ id: 't-1', name: 'Parks', status: 'active' }])
          }
          return (...args: unknown[]) => {
            if (prop === 'where' || prop === 'andWhere') where.push(String(args[0]))
            else calls[prop] = args
            return qb
          }
        },
      },
    )
    const service = new ApiKeyUsageService(
      {} as Repository<ApiKeyConsumer>,
      {} as Repository<ApiKeyLimit>,
      {} as Repository<ApiKeyLimitAlert>,
      {} as Repository<ApiKeyUsage>,
      {} as Repository<NotifyConfiguration>,
      { createQueryBuilder: () => qb } as unknown as Repository<Tenant>,
    )

    await expect(service.listNotifyTenants()).resolves.toEqual([{ id: 't-1', name: 'Parks' }])
    expect(where).toEqual(['t.isDeleted = :deleted', 't.externalId IS NOT NULL'])
    expect(calls.orderBy).toEqual(['t.name', 'ASC'])
  })
})

describe('averageWindow', () => {
  it('covers the 12 full calendar months before the current one', () => {
    expect(averageWindow(new Date('2026-11-06T18:00:00Z'))).toEqual({
      start: new Date('2025-11-01T00:00:00Z'),
      end: new Date('2026-11-01T00:00:00Z'),
    })
  })

  it('crosses the year boundary in January', () => {
    expect(averageWindow(new Date('2027-01-15T00:00:00Z'))).toEqual({
      start: new Date('2026-01-01T00:00:00Z'),
      end: new Date('2027-01-01T00:00:00Z'),
    })
  })
})

describe('averageMonthlySends', () => {
  const window = averageWindow(new Date('2026-11-06T18:00:00Z'))

  it('averages over all 12 months for a tenant sending since before the window', () => {
    expect(averageMonthlySends(1200, new Date('2024-03-10T00:00:00Z'), window)).toBe(100)
  })

  it('averages only over the months since a newer tenant started', () => {
    // First send in August: August, September and October count.
    expect(averageMonthlySends(300, new Date('2026-08-20T00:00:00Z'), window)).toBe(100)
  })

  it('has no average before the tenant has a month in the window', () => {
    expect(averageMonthlySends(5, new Date('2026-11-02T00:00:00Z'), window)).toBeNull()
  })
})

describe('channelsInScope', () => {
  it('covers every channel when there is no channel filter', () => {
    expect(channelsInScope([])).toEqual(['EMAIL', 'SMS'])
  })

  it.each<[ListQueryFilter, string[]]>([
    [{ field: 'channel', operator: 'in', value: ['sms'] }, ['SMS']],
    [{ field: 'channel', operator: 'eq', value: 'EMAIL' }, ['EMAIL']],
    [{ field: 'channel', operator: 'in', value: ['FAX'] }, []],
  ])('narrows to the channels a filter names: %j', (filter, expected) => {
    expect(channelsInScope([filter])).toEqual(expected)
  })
})
