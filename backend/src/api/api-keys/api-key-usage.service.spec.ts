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
