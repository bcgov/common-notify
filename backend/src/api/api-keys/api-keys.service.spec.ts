import { In, Repository } from 'typeorm'
import { vi } from 'vitest'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { ApiKeyConsumer } from './entities/api-key-consumer.entity'
import { ApiKeyLimit } from './entities/api-key-limit.entity'
import { ApiKeyLimitAlert } from './entities/api-key-limit-alert.entity'
import { ApiKeysService } from './api-keys.service'

/** An `insert().into().values().orIgnore().execute()` chain that records the inserted rows. */
const insertChain = () => {
  const values = vi.fn()
  const chain = {
    insert: () => chain,
    into: () => chain,
    values: (rows: unknown) => {
      values(rows)
      return chain
    },
    orIgnore: () => chain,
    execute: vi.fn().mockResolvedValue(undefined),
  }
  return { chain, values }
}

describe('ApiKeysService.ensureDefaults', () => {
  const limitInsert = insertChain()
  const alertInsert = insertChain()

  const apiKeyConsumerRepository = {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn((mapping: Partial<ApiKeyConsumer>) => mapping),
    save: vi.fn((mapping: Partial<ApiKeyConsumer>) =>
      Promise.resolve({ ...mapping, id: 'consumer-new' }),
    ),
  }
  const apiKeyLimitRepository = { find: vi.fn(), createQueryBuilder: () => limitInsert.chain }
  const apiKeyLimitAlertRepository = { find: vi.fn(), createQueryBuilder: () => alertInsert.chain }
  const tenantRepository = { findOne: vi.fn() }

  const service = new ApiKeysService(
    apiKeyConsumerRepository as unknown as Repository<ApiKeyConsumer>,
    apiKeyLimitRepository as unknown as Repository<ApiKeyLimit>,
    apiKeyLimitAlertRepository as unknown as Repository<ApiKeyLimitAlert>,
    tenantRepository as unknown as Repository<Tenant>,
  )

  // Called for every newly bound key, whether it was issued from the Notify UI or
  // self-bound by the load test.
  const seed = () => service.ensureDefaults('consumer-new', 'tenant-1')

  beforeEach(() => {
    vi.clearAllMocks()
    tenantRepository.findOne.mockResolvedValue({ id: 'tenant-1', name: 'Tenant 1' })
    apiKeyConsumerRepository.findOne.mockResolvedValue(null)
  })

  it("copies the tenant's current limits and thresholds to a key joining an existing tenant", async () => {
    apiKeyConsumerRepository.find.mockResolvedValue([
      { id: 'consumer-new' },
      { id: 'consumer-old' },
    ])
    apiKeyLimitRepository.find.mockResolvedValue([
      {
        channelCode: 'EMAIL',
        rateLimitPerMinute: 1000,
        dailyLimit: 300_010,
        annualLimit: 10_000_000,
      },
      { channelCode: 'SMS', rateLimitPerMinute: 1000, dailyLimit: 10_000, annualLimit: 100_000 },
    ])
    apiKeyLimitAlertRepository.find.mockResolvedValue([
      { channelCode: 'EMAIL', warnThresholdPercent: 60 },
    ])

    await seed()

    expect(apiKeyLimitRepository.find).toHaveBeenCalledWith({
      where: { apiKeyConsumerId: In(['consumer-old']) },
    })
    expect(limitInsert.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          apiKeyConsumerId: 'consumer-new',
          channelCode: 'EMAIL',
          dailyLimit: 300_010,
          annualLimit: 10_000_000,
        }),
      ]),
    )
    expect(alertInsert.values).toHaveBeenCalledWith([
      expect.objectContaining({ channelCode: 'EMAIL', warnThresholdPercent: 60 }),
      expect.objectContaining({ channelCode: 'SMS', warnThresholdPercent: 80 }),
    ])
  })

  it("seeds the default limits for a tenant's first key", async () => {
    apiKeyConsumerRepository.find.mockResolvedValue([{ id: 'consumer-new' }])

    await seed()

    expect(apiKeyLimitRepository.find).not.toHaveBeenCalled()
    expect(limitInsert.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          apiKeyConsumerId: 'consumer-new',
          channelCode: 'EMAIL',
          dailyLimit: 100_000,
          annualLimit: 20_000_000,
        }),
      ]),
    )
  })
})
