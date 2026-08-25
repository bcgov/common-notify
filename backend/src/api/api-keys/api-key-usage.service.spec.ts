import { Repository } from 'typeorm'
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
    apiKeyUsageRepository.query.mockResolvedValue([
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
})

describe('ApiKeyUsageService.assertWithinLimits', () => {
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
    {} as Repository<ApiKeyConsumer>,
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
