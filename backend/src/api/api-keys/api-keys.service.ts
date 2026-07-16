import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ApiKeyConsumer } from './entities/api-key-consumer.entity'
import { ApiKeyLimit } from './entities/api-key-limit.entity'
import { ApiKeyLimitAlert } from './entities/api-key-limit-alert.entity'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { CstarApiClient } from '../../services/cstar/cstar-api.client'

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
    private readonly cstarApiClient: CstarApiClient,
  ) {}

  /**
   * Ensure an API key has its default per-channel limit rows AND alert configuration.
   * Idempotent: existing rows are left untouched (ON CONFLICT DO NOTHING), so re-binding
   * never clobbers customized limits or thresholds.
   */
  private async ensureDefaults(apiKeyConsumerId: string): Promise<void> {
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
   * Bind an API key to a CSTAR tenant.
   *
   * Verifies that the requesting user (identified by their JWT) is a member of the
   * given CSTAR tenant, then stores a mapping from the Kong credential identifier
   * to the Notify tenant. Idempotent if the key is already bound to the same tenant.
   *
   * @param credentialIdentifier - Kong per-key ID from x-credential-identifier header
   * @param consumerId - Kong consumer UUID from x-consumer-id header (stored for audit)
   * @param cstarTenantId - CSTAR tenant GUID from request body
   * @param idirUserGuid - Caller's IDIR user GUID from JWT payload
   * @param authHeader - Raw Authorization header to forward to CSTAR for membership check
   */
  async bindApiKey(params: {
    credentialIdentifier: string
    consumerId: string
    cstarTenantId: string
    idirUserGuid: string
    authHeader: string
  }): Promise<ApiKeyConsumer> {
    const { credentialIdentifier, consumerId, cstarTenantId, idirUserGuid, authHeader } = params

    // 1. Verify user is a member of the requested CSTAR tenant
    const userTenants = await this.cstarApiClient.getUserTenants(idirUserGuid, authHeader)
    const userTenantIds = userTenants.map((t: any) => (typeof t === 'string' ? t : t.id))

    if (!userTenantIds.includes(cstarTenantId)) {
      this.logger.warn(
        `User ${idirUserGuid} attempted to bind API key to tenant ${cstarTenantId} but is not a member`,
      )
      throw new ForbiddenException('You do not have access to the specified CSTAR tenant')
    }

    // 2. Look up the corresponding Notify tenant
    const tenant = await this.tenantRepository.findOne({
      where: { externalId: cstarTenantId, isDeleted: false },
    })

    if (!tenant) {
      this.logger.warn(`No active Notify tenant found for CSTAR external ID ${cstarTenantId}`)
      throw new NotFoundException(
        `No Notify tenant is configured for CSTAR tenant ID "${cstarTenantId}"`,
      )
    }

    // 3. Check for an existing binding
    const existing = await this.apiKeyConsumerRepository.findOne({
      where: { credentialIdentifier },
    })

    if (existing) {
      if (existing.tenantId === tenant.id) {
        this.logger.debug(
          `API key ${credentialIdentifier} is already bound to tenant ${tenant.id} — idempotent`,
        )
        // Self-heal: ensure default limits and alert config exist even if a previous bind missed them.
        await this.ensureDefaults(existing.id)
        return existing
      }
      this.logger.warn(
        `API key ${credentialIdentifier} is already bound to a different tenant (${existing.tenantId})`,
      )
      throw new ConflictException('This API key is already bound to a different tenant')
    }

    // 4. Create the mapping
    const now = new Date()
    const mapping = this.apiKeyConsumerRepository.create({
      credentialIdentifier,
      consumerId: consumerId || undefined,
      tenantId: tenant.id,
      boundByIdirGuid: idirUserGuid,
      createdAt: now,
      updatedAt: now,
    })

    const saved = await this.apiKeyConsumerRepository.save(mapping)

    // Seed default per-channel limits and alert config for the newly onboarded API key.
    await this.ensureDefaults(saved.id)

    this.logger.log(
      `API key ${credentialIdentifier} bound to tenant "${tenant.name}" (${tenant.id}) by user ${idirUserGuid} with default limits`,
    )
    return saved
  }
}
