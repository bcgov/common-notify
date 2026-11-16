import { Repository } from 'typeorm'
import { vi, afterAll } from 'vitest'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { ApiKeyConsumer } from './entities/api-key-consumer.entity'
import { ApiKeysService } from './api-keys.service'
import { seedTenantLimitDefaults } from './tenant-limit-defaults'

vi.mock('./tenant-limit-defaults', () => ({ seedTenantLimitDefaults: vi.fn() }))

describe('ApiKeysService.autoBindApiKeyForLoadTest', () => {
  const loadtestTenant = { id: 'loadtest-tenant-id', slug: 'loadtest-tenant' }
  const apiKeyConsumerRepository = {
    findOne: vi.fn(),
    create: vi.fn((mapping: Partial<ApiKeyConsumer>) => mapping),
    save: vi.fn((mapping: Partial<ApiKeyConsumer>) => Promise.resolve({ ...mapping, id: 'c-1' })),
  }
  const tenantRepository = {
    findOne: vi.fn(),
    create: vi.fn((tenant: Partial<Tenant>) => tenant),
    save: vi.fn(),
    manager: {},
  }
  const service = new ApiKeysService(
    apiKeyConsumerRepository as unknown as Repository<ApiKeyConsumer>,
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

  it('creates the load-test tenant with default limits on first use', async () => {
    tenantRepository.findOne.mockResolvedValue(null)
    tenantRepository.save.mockResolvedValue(loadtestTenant)
    apiKeyConsumerRepository.findOne.mockResolvedValue(null)

    await service.autoBindApiKeyForLoadTest('cred-new', 'consumer-1')

    expect(seedTenantLimitDefaults).toHaveBeenCalledWith(
      tenantRepository.manager,
      loadtestTenant.id,
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
