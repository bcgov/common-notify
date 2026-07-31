import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { vi } from 'vitest'
import { UsagePeriodType } from '../../enum/usage-period-type.enum'
import { TenantSettings } from '../tenant-settings/entities/tenant-settings.entity'
import { ApiKeyConsumer } from './entities/api-key-consumer.entity'
import { ApiKeyLimit } from './entities/api-key-limit.entity'
import { ApiKeyLimitAlert } from './entities/api-key-limit-alert.entity'
import { ApiKeyLimitAlertLog } from './entities/api-key-limit-alert-log.entity'
import { LimitAlertService, ProcessLimitAlertUsageInput } from './limit-alert.service'

describe('LimitAlertService', () => {
  let service: LimitAlertService

  const apiKeyConsumerRepository = {
    findOne: vi.fn(),
  }
  const apiKeyLimitRepository = {
    findOne: vi.fn(),
  }
  const apiKeyLimitAlertRepository = {
    findOne: vi.fn(),
  }
  const apiKeyLimitAlertLogRepository = {
    query: vi.fn(),
    update: vi.fn(),
  }
  const tenantSettingsRepository = {
    findOne: vi.fn(),
  }
  const fiscalYearStart = new Date('2026-04-01T00:00:00.000Z')
  const dayPeriodStart = new Date('2026-07-29T00:00:00.000Z')

  const input = (
    usageResults: ProcessLimitAlertUsageInput['usageResults'],
  ): ProcessLimitAlertUsageInput => ({
    apiKeyConsumerId: 'consumer-1',
    usageResults,
  })

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LimitAlertService,
        {
          provide: getRepositoryToken(ApiKeyConsumer),
          useValue: apiKeyConsumerRepository,
        },
        {
          provide: getRepositoryToken(ApiKeyLimit),
          useValue: apiKeyLimitRepository,
        },
        {
          provide: getRepositoryToken(ApiKeyLimitAlert),
          useValue: apiKeyLimitAlertRepository,
        },
        {
          provide: getRepositoryToken(ApiKeyLimitAlertLog),
          useValue: apiKeyLimitAlertLogRepository,
        },
        {
          provide: getRepositoryToken(TenantSettings),
          useValue: tenantSettingsRepository,
        },
      ],
    }).compile()

    service = module.get<LimitAlertService>(LimitAlertService)
    vi.clearAllMocks()

    apiKeyConsumerRepository.findOne.mockResolvedValue({
      id: 'consumer-1',
      tenantId: 'tenant-1',
    })
    tenantSettingsRepository.findOne.mockResolvedValue({
      tenantId: 'tenant-1',
      alertEmail: 'alerts@example.com',
      isDeleted: false,
    })
    apiKeyLimitRepository.findOne.mockResolvedValue({
      apiKeyConsumerId: 'consumer-1',
      channelCode: 'EMAIL',
      dailyLimit: 100,
      annualLimit: 1_000,
    })
    apiKeyLimitAlertRepository.findOne.mockResolvedValue({
      apiKeyConsumerId: 'consumer-1',
      channelCode: 'EMAIL',
      alertsEnabled: true,
      warnThresholdPercent: 80,
    })
    apiKeyLimitAlertLogRepository.query.mockImplementation(
      (_sql: string, parameters: unknown[]) => {
        const periodTypeCode = parameters[2]
        return Promise.resolve([{ id: `log-${periodTypeCode}` }])
      },
    )
    apiKeyLimitAlertLogRepository.update.mockResolvedValue({ affected: 1 })
  })

  it('returns no alerts for empty usage input', async () => {
    await expect(service.evaluateAndClaim(input([]))).resolves.toEqual([])
    expect(apiKeyConsumerRepository.findOne).not.toHaveBeenCalled()
  })

  it('returns no alerts when the API key consumer ID is missing', async () => {
    await expect(
      service.evaluateAndClaim({ apiKeyConsumerId: '', usageResults: [] }),
    ).resolves.toEqual([])
  })

  it('treats a missing alert-config row as alerts disabled', async () => {
    apiKeyLimitAlertRepository.findOne.mockResolvedValue(null)

    await expect(
      service.evaluateAndClaim(
        input([
          {
            channelCode: 'EMAIL',
            periodTypeCode: UsagePeriodType.DAY,
            periodStart: dayPeriodStart,
            sentCount: 85,
          },
        ]),
      ),
    ).resolves.toEqual([])
    expect(apiKeyLimitAlertLogRepository.query).not.toHaveBeenCalled()
  })

  it('returns no alerts when alerts are explicitly disabled', async () => {
    apiKeyLimitAlertRepository.findOne.mockResolvedValue({
      alertsEnabled: false,
      warnThresholdPercent: 80,
    })

    await expect(
      service.evaluateAndClaim(
        input([
          {
            channelCode: 'EMAIL',
            periodTypeCode: UsagePeriodType.DAY,
            periodStart: dayPeriodStart,
            sentCount: 100,
          },
        ]),
      ),
    ).resolves.toEqual([])
    expect(apiKeyLimitAlertLogRepository.query).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', null],
    ['deleted', null],
    ['blank', { tenantId: 'tenant-1', alertEmail: null, isDeleted: false }],
  ])('returns no alerts when the tenant alert email is %s', async (_case, settings) => {
    tenantSettingsRepository.findOne.mockResolvedValue(settings)

    await expect(
      service.evaluateAndClaim(
        input([
          {
            channelCode: 'EMAIL',
            periodTypeCode: UsagePeriodType.DAY,
            periodStart: dayPeriodStart,
            sentCount: 85,
          },
        ]),
      ),
    ).resolves.toEqual([])
    expect(tenantSettingsRepository.findOne).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', isDeleted: false },
    })
    expect(apiKeyLimitRepository.findOne).not.toHaveBeenCalled()
  })

  it('claims and returns a DAY warning using the supplied post-increment count', async () => {
    const result = await service.evaluateAndClaim(
      input([
        {
          channelCode: 'EMAIL',
          periodTypeCode: UsagePeriodType.DAY,
          periodStart: dayPeriodStart,
          sentCount: 85,
        },
      ]),
    )

    expect(result).toEqual([
      {
        alertLogId: 'log-DAY',
        tenantId: 'tenant-1',
        recipientEmail: 'alerts@example.com',
        apiKeyConsumerId: 'consumer-1',
        channelCode: 'EMAIL',
        periodTypeCode: 'DAY',
        alertLevel: 'WARN',
        periodStart: dayPeriodStart,
        sentCount: 85,
        limit: 100,
        percent: 85,
      },
    ])
    expect(apiKeyLimitAlertLogRepository.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT'),
      ['consumer-1', 'EMAIL', 'DAY', dayPeriodStart, 'WARN'],
    )
    expect(apiKeyLimitAlertLogRepository.query.mock.calls[0][0]).not.toContain(
      "date_trunc('day', now())",
    )
  })

  it('claims and returns a YEAR limit-reached alert', async () => {
    const result = await service.evaluateAndClaim(
      input([
        {
          channelCode: 'EMAIL',
          periodTypeCode: UsagePeriodType.YEAR,
          periodStart: fiscalYearStart,
          sentCount: 1_000,
        },
      ]),
    )

    expect(result[0]).toMatchObject({
      alertLogId: 'log-YEAR',
      periodTypeCode: 'YEAR',
      alertLevel: 'LIMIT_REACHED',
      periodStart: fiscalYearStart,
      sentCount: 1_000,
      limit: 1_000,
      percent: 100,
    })
  })

  it('claims DAY and YEAR candidates independently', async () => {
    const result = await service.evaluateAndClaim(
      input([
        {
          channelCode: 'EMAIL',
          periodTypeCode: UsagePeriodType.YEAR,
          periodStart: fiscalYearStart,
          sentCount: 1_000,
        },
        {
          channelCode: 'EMAIL',
          periodTypeCode: UsagePeriodType.DAY,
          periodStart: dayPeriodStart,
          sentCount: 85,
        },
      ]),
    )

    expect(result).toHaveLength(2)
    expect(
      result.map(({ periodTypeCode, alertLevel }) => ({ periodTypeCode, alertLevel })),
    ).toEqual([
      { periodTypeCode: 'DAY', alertLevel: 'WARN' },
      { periodTypeCode: 'YEAR', alertLevel: 'LIMIT_REACHED' },
    ])
  })

  it('evaluates two channels independently', async () => {
    apiKeyLimitRepository.findOne.mockImplementation(({ where }) =>
      Promise.resolve({
        ...where,
        dailyLimit: where.channelCode === 'EMAIL' ? 100 : 50,
        annualLimit: 1_000,
      }),
    )
    apiKeyLimitAlertRepository.findOne.mockImplementation(({ where }) =>
      Promise.resolve({ ...where, alertsEnabled: true, warnThresholdPercent: 80 }),
    )

    const result = await service.evaluateAndClaim(
      input([
        {
          channelCode: 'EMAIL',
          periodTypeCode: UsagePeriodType.DAY,
          periodStart: dayPeriodStart,
          sentCount: 80,
        },
        {
          channelCode: 'SMS',
          periodTypeCode: UsagePeriodType.DAY,
          periodStart: dayPeriodStart,
          sentCount: 50,
        },
      ]),
    )

    expect(result).toHaveLength(2)
    expect(result.map(({ channelCode, alertLevel }) => ({ channelCode, alertLevel }))).toEqual([
      { channelCode: 'EMAIL', alertLevel: 'WARN' },
      { channelCode: 'SMS', alertLevel: 'LIMIT_REACHED' },
    ])
  })

  it('uses each supplied period start unchanged when claims span a DAY boundary', async () => {
    const beforeBoundaryBucket = new Date('2026-07-29T00:00:00.000Z')
    const afterBoundaryBucket = new Date('2026-07-30T00:00:00.000Z')
    apiKeyLimitRepository.findOne.mockImplementation(({ where }) =>
      Promise.resolve({
        ...where,
        dailyLimit: where.channelCode === 'EMAIL' ? 100 : 50,
        annualLimit: 1_000,
      }),
    )
    apiKeyLimitAlertRepository.findOne.mockImplementation(({ where }) =>
      Promise.resolve({ ...where, alertsEnabled: true, warnThresholdPercent: 80 }),
    )

    await service.evaluateAndClaim(
      input([
        {
          channelCode: 'EMAIL',
          periodTypeCode: UsagePeriodType.DAY,
          periodStart: beforeBoundaryBucket,
          sentCount: 85,
        },
        {
          channelCode: 'SMS',
          periodTypeCode: UsagePeriodType.DAY,
          periodStart: afterBoundaryBucket,
          sentCount: 50,
        },
      ]),
    )

    expect(apiKeyLimitAlertLogRepository.query.mock.calls[0][1][3]).toBe(beforeBoundaryBucket)
    expect(apiKeyLimitAlertLogRepository.query.mock.calls[1][1][3]).toBe(afterBoundaryBucket)
  })

  it('skips a missing DAY or YEAR usage result', async () => {
    const result = await service.evaluateAndClaim(
      input([
        {
          channelCode: 'EMAIL',
          periodTypeCode: UsagePeriodType.DAY,
          periodStart: dayPeriodStart,
          sentCount: 85,
        },
      ]),
    )

    expect(result).toHaveLength(1)
    expect(result[0].periodTypeCode).toBe('DAY')
    expect(apiKeyLimitAlertLogRepository.query).toHaveBeenCalledTimes(1)
  })

  it('returns no claimed alert when the atomic insert loses a dedup conflict', async () => {
    apiKeyLimitAlertLogRepository.query.mockResolvedValue([])

    await expect(
      service.evaluateAndClaim(
        input([
          {
            channelCode: 'EMAIL',
            periodTypeCode: UsagePeriodType.DAY,
            periodStart: dayPeriodStart,
            sentCount: 85,
          },
        ]),
      ),
    ).resolves.toEqual([])
  })

  it('returns output only for successful INSERT RETURNING claims', async () => {
    apiKeyLimitAlertLogRepository.query
      .mockResolvedValueOnce([{ id: 'log-DAY' }])
      .mockResolvedValueOnce([])

    const result = await service.evaluateAndClaim(
      input([
        {
          channelCode: 'EMAIL',
          periodTypeCode: UsagePeriodType.DAY,
          periodStart: dayPeriodStart,
          sentCount: 85,
        },
        {
          channelCode: 'EMAIL',
          periodTypeCode: UsagePeriodType.YEAR,
          periodStart: fiscalYearStart,
          sentCount: 1_000,
        },
      ]),
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ alertLogId: 'log-DAY', periodTypeCode: 'DAY' })
  })

  it('sets notification_request_id without setting enqueued_at', async () => {
    await service.markNotificationCreated('log-1', 'request-1')

    expect(apiKeyLimitAlertLogRepository.update).toHaveBeenCalledWith(
      { id: 'log-1' },
      { notificationRequestId: 'request-1' },
    )
  })

  it('sets enqueued_at only through the enqueue-success method', async () => {
    await service.markNotificationCreated('log-1', 'request-1')
    expect(apiKeyLimitAlertLogRepository.update).not.toHaveBeenCalledWith(
      { id: 'log-1' },
      expect.objectContaining({ enqueuedAt: expect.any(Date) }),
    )

    await service.markEnqueued('log-1')
    expect(apiKeyLimitAlertLogRepository.update).toHaveBeenLastCalledWith(
      { id: 'log-1' },
      { enqueuedAt: expect.any(Date) },
    )
  })
})
