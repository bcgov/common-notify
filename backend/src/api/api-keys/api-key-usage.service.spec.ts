import { In, Repository } from 'typeorm'
import { vi } from 'vitest'
import { UsagePeriodType } from '../../enum/usage-period-type.enum'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import { ApiKeyConsumer } from './entities/api-key-consumer.entity'
import { ApiKeyLimit } from './entities/api-key-limit.entity'
import { ApiKeyLimitAlert } from './entities/api-key-limit-alert.entity'
import { ApiKeyUsage } from './entities/api-key-usage.entity'
import { ApiKeyUsageService } from './api-key-usage.service'

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
