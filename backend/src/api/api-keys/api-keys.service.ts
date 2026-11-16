import { Injectable, Logger, ForbiddenException, ConflictException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ApiKeyConsumer } from './entities/api-key-consumer.entity'
import { seedTenantLimitDefaults } from './tenant-limit-defaults'
import { Tenant } from '../admin/tenants/entities/tenant.entity'

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name)

  constructor(
    @InjectRepository(ApiKeyConsumer)
    private readonly apiKeyConsumerRepository: Repository<ApiKeyConsumer>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  /**
   * Load-test-only: bind an API key to a dedicated throwaway load-test tenant,
   * creating that tenant on first use. No JWT / CSTAR membership check.
   *
   * Callable ONLY when loadtest.autobindEnabled is true (guarded upstream). Exists so
   * a load test running against an ephemeral PR dev environment can authenticate
   * without a manual binding step. Idempotent.
   */
  async autoBindApiKeyForLoadTest(
    credentialIdentifier: string,
    consumerId: string,
  ): Promise<ApiKeyConsumer> {
    // Defense-in-depth: refuse to auto-bind in test/prod namespaces even if the
    // config flag were somehow enabled there. (All envs run NODE_ENV=production, so
    // the namespace is the reliable discriminator.)
    const namespace = process.env.NAMESPACE || ''
    if (namespace.includes('-test') || namespace.includes('-prod')) {
      this.logger.error(`[LOADTEST] Refusing auto-bind in protected namespace "${namespace}"`)
      throw new ForbiddenException('Load-test auto-bind is disabled in this environment')
    }

    const LOADTEST_SLUG = 'loadtest-tenant'
    const now = new Date()

    let tenant = await this.tenantRepository.findOne({ where: { slug: LOADTEST_SLUG } })
    if (!tenant) {
      // `status` column has a DB default of 'active' and is insert:false on the entity.
      tenant = await this.tenantRepository.save(
        this.tenantRepository.create({
          externalId: 'loadtest',
          name: 'Load Test Tenant',
          slug: LOADTEST_SLUG,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        }),
      )
      await seedTenantLimitDefaults(this.tenantRepository.manager, tenant.id)
      this.logger.warn(`[LOADTEST] Created load-test tenant ${tenant.id}`)
    }

    const existing = await this.apiKeyConsumerRepository.findOne({
      where: { credentialIdentifier },
    })
    if (existing) {
      // Never move a key off a real tenant: that would let anyone holding a tenant's DEV key
      // re-point it at the load-test tenant while auto-bind is on. Only a new key, or the
      // load-test key on a later run, gets through.
      if (existing.tenantId !== tenant.id) {
        this.logger.error(
          `[LOADTEST] Refusing to re-bind credential ${credentialIdentifier}: bound to tenant ${existing.tenantId}`,
        )
        throw new ConflictException(
          'This API key belongs to another tenant and cannot be used for load testing. Use a dedicated load-test key.',
        )
      }
      return existing
    }

    const mapping = this.apiKeyConsumerRepository.create({
      credentialIdentifier,
      consumerId: consumerId || undefined,
      tenantId: tenant.id,
      boundByIdirGuid: 'loadtest-autobind',
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.apiKeyConsumerRepository.save(mapping)
    this.logger.warn(
      `[LOADTEST] Auto-bound credential ${credentialIdentifier} to load-test tenant ${tenant.id}`,
    )
    return saved
  }
}
