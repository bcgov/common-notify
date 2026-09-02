import { Injectable, Logger, ForbiddenException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ApiKeyConsumer } from './entities/api-key-consumer.entity'
import { ApiKeyLimit } from './entities/api-key-limit.entity'
import { ApiKeyLimitAlert } from './entities/api-key-limit-alert.entity'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { NotificationChannel } from '../../enum/notification-channel.enum'

/**
 * Default notification limits applied per channel when an API key is first bound.
 * Mirrors the seed values in migration V40.
 */
const DEFAULT_LIMITS: Array<{
  channelCode: string
  rateLimitPerMinute: number
  dailyLimit: number
  annualLimit: number
}> = [
  {
    channelCode: NotificationChannel.EMAIL,
    rateLimitPerMinute: 1000,
    dailyLimit: 100000,
    annualLimit: 20000000,
  },
  {
    channelCode: NotificationChannel.SMS,
    rateLimitPerMinute: 1000,
    dailyLimit: 10000,
    annualLimit: 100000,
  },
]

/** Channels that receive default alert configuration on bind. */
const ALERT_CHANNELS: string[] = [NotificationChannel.EMAIL, NotificationChannel.SMS]

/** Default warning threshold (percent of a limit) for a newly bound key. */
const DEFAULT_WARN_THRESHOLD_PERCENT = 80

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name)

  constructor(
    @InjectRepository(ApiKeyConsumer)
    private readonly apiKeyConsumerRepository: Repository<ApiKeyConsumer>,
    @InjectRepository(ApiKeyLimit)
    private readonly apiKeyLimitRepository: Repository<ApiKeyLimit>,
    @InjectRepository(ApiKeyLimitAlert)
    private readonly apiKeyLimitAlertRepository: Repository<ApiKeyLimitAlert>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  /**
   * Ensure an API key has its default per-channel limit rows AND alert configuration.
   * Idempotent: existing rows are left untouched (ON CONFLICT DO NOTHING), so re-binding
   * never clobbers customized limits or thresholds.
   *
   * Public because ApiKeyIssuanceService seeds the same defaults for self-issued keys —
   * a key must land on identical limits regardless of how it was created.
   */
  async ensureDefaults(apiKeyConsumerId: string): Promise<void> {
    await this.apiKeyLimitRepository
      .createQueryBuilder()
      .insert()
      .into(ApiKeyLimit)
      .values(
        DEFAULT_LIMITS.map((limit) => ({
          ...limit,
          apiKeyConsumerId,
          createdBy: 'system',
          updatedBy: 'system',
        })),
      )
      .orIgnore()
      .execute()

    await this.apiKeyLimitAlertRepository
      .createQueryBuilder()
      .insert()
      .into(ApiKeyLimitAlert)
      .values(
        ALERT_CHANNELS.map((channelCode) => ({
          apiKeyConsumerId,
          channelCode,
          warnThresholdPercent: DEFAULT_WARN_THRESHOLD_PERCENT,
          createdBy: 'system',
          updatedBy: 'system',
        })),
      )
      .orIgnore()
      .execute()
  }

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
      this.logger.warn(`[LOADTEST] Created load-test tenant ${tenant.id}`)
    }

    const existing = await this.apiKeyConsumerRepository.findOne({
      where: { credentialIdentifier },
    })
    if (existing) {
      if (existing.tenantId !== tenant.id) {
        existing.tenantId = tenant.id
        existing.updatedAt = now
        await this.apiKeyConsumerRepository.save(existing)
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
