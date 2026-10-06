import { Injectable, Logger, ForbiddenException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { ApiKeyConsumer } from './entities/api-key-consumer.entity'
import { ApiKeyLimit } from './entities/api-key-limit.entity'
import { ApiKeyLimitAlert } from './entities/api-key-limit-alert.entity'
import { lowestLimitsByChannel, lowestThresholdsByChannel } from './tenant-limits'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { NotificationChannel } from '../../enum/notification-channel.enum'

/**
 * Default notification limits applied per channel when a tenant's first API key is bound.
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
   * Ensure an API key has its per-channel limit rows AND alert configuration.
   *
   * Limits are tenant-wide and the lowest across a tenant's keys is enforced, so a key joining
   * a tenant that already has keys copies their limits and thresholds. Seeding it with the
   * defaults instead would quietly override any limit an admin had set on the tenant.
   *
   * Idempotent: existing rows are left untouched (ON CONFLICT DO NOTHING), so re-binding
   * never clobbers customized limits or thresholds.
   *
   * Public because ApiKeyIssuanceService seeds self-issued keys the same way — a key must
   * land on the tenant's limits regardless of how it was created.
   */
  async ensureDefaults(apiKeyConsumerId: string, tenantId: string): Promise<void> {
    const siblingIds = (await this.apiKeyConsumerRepository.find({ where: { tenantId } }))
      .map(({ id }) => id)
      .filter((id) => id !== apiKeyConsumerId)

    const [siblingLimits, siblingAlerts]: [ApiKeyLimit[], ApiKeyLimitAlert[]] =
      siblingIds.length > 0
        ? await Promise.all([
            this.apiKeyLimitRepository.find({ where: { apiKeyConsumerId: In(siblingIds) } }),
            this.apiKeyLimitAlertRepository.find({ where: { apiKeyConsumerId: In(siblingIds) } }),
          ])
        : [[], []]
    const tenantLimits = lowestLimitsByChannel(siblingLimits)
    const tenantThresholds = lowestThresholdsByChannel(siblingAlerts)

    await this.apiKeyLimitRepository
      .createQueryBuilder()
      .insert()
      .into(ApiKeyLimit)
      .values(
        DEFAULT_LIMITS.map((limit) => ({
          ...limit,
          ...tenantLimits.get(limit.channelCode),
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
          warnThresholdPercent: tenantThresholds.get(channelCode) ?? DEFAULT_WARN_THRESHOLD_PERCENT,
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
