import { In, Repository } from 'typeorm'
import { vi, afterAll } from 'vitest'
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

describe('ApiKeysService.autoBindApiKeyForLoadTest', () => {
  const loadtestTenant = { id: 'loadtest-tenant-id', slug: 'loadtest-tenant' }
  const apiKeyConsumerRepository = {
    findOne: vi.fn(),
    create: vi.fn((mapping: Partial<ApiKeyConsumer>) => mapping),
    save: vi.fn((mapping: Partial<ApiKeyConsumer>) => Promise.resolve({ ...mapping, id: 'c-1' })),
  }
  const tenantRepository = { findOne: vi.fn(), create: vi.fn(), save: vi.fn() }
  const service = new ApiKeysService(
    apiKeyConsumerRepository as unknown as Repository<ApiKeyConsumer>,
    {} as Repository<ApiKeyLimit>,
    {} as Repository<ApiKeyLimitAlert>,
    tenantRepository as unknown as Repository<Tenant>,
  )
  const originalNamespace = process.env.NAMESPACE

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NAMESPACE = 'fe8c5-dev'
    tenantRepository.findOne.mockResolvedValue(loadtestTenant)
  })

  afterAll(() => {
    process.env.NAMESPACE = originalNamespace
  })

  it('binds a new key to the load-test tenant', async () => {
    apiKeyConsumerRepository.findOne.mockResolvedValue(null)

    await service.autoBindApiKeyForLoadTest('cred-new', 'consumer-1')

    expect(apiKeyConsumerRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ credentialIdentifier: 'cred-new', tenantId: loadtestTenant.id }),
    )
  })

  it('leaves the load-test key alone on a later run', async () => {
    const existing = { credentialIdentifier: 'cred-lt', tenantId: loadtestTenant.id }
    apiKeyConsumerRepository.findOne.mockResolvedValue(existing)

    await expect(service.autoBindApiKeyForLoadTest('cred-lt', '')).resolves.toBe(existing)
    expect(apiKeyConsumerRepository.save).not.toHaveBeenCalled()
  })

  it("refuses to move a real tenant's key onto the load-test tenant", async () => {
    apiKeyConsumerRepository.findOne.mockResolvedValue({
      credentialIdentifier: 'cred-real',
      tenantId: 'real-tenant-id',
    })

    await expect(service.autoBindApiKeyForLoadTest('cred-real', '')).rejects.toThrow(
      /belongs to another tenant/,
    )
    expect(apiKeyConsumerRepository.save).not.toHaveBeenCalled()
  })

  it.each(['fe8c5-test', 'fe8c5-prod'])('refuses to run at all in %s', async (namespace) => {
    process.env.NAMESPACE = namespace

    await expect(service.autoBindApiKeyForLoadTest('cred-new', '')).rejects.toThrow(
      /disabled in this environment/,
    )
    expect(apiKeyConsumerRepository.findOne).not.toHaveBeenCalled()
  })
})
