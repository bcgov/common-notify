import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FeatureFlagService } from '../feature-flag/feature-flag.service'
import { FeatureFlagCode } from '../../enum/feature-flag-code.enum'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import { NotifyUser } from '../admin/users/entities/notify-user.entity'
import { RecipientSafelist } from './entities/recipient-safelist.entity'
import { CreateSafelistEntryDto } from './schemas/create-safelist-entry.dto'
import { SafelistEntryDto } from './schemas/safelist-entry.dto'
import { isValidRecipient, normalizeRecipient } from './safelist.util'

const MAX_ENTRIES_KEY = 'safelist_max_entries'
const DEFAULT_MAX_ENTRIES = 50
/** How long the enforcement flag is trusted before it is re-read. See isEnforced(). */
const ENFORCED_CACHE_TTL_MS = 30_000
const UUID_PATTERN = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i

/** One recipient of an outbound request, as the send path sees it. */
export interface SafelistCandidate {
  address: string
  channel: string
}

/**
 * Recipient safelist ("whitelist").
 *
 * A non-production guardrail: in environments where the `recipient_safelist` feature flag is
 * enabled, a tenant may only send to recipients it has safelisted. Enforcement is fail-closed —
 * a tenant with no entries can send nothing — so an environment that has the flag on can never
 * contact a real person by accident.
 *
 * The flag is read globally (no tenant argument) on purpose. A per-tenant override would be a
 * way to switch the guardrail off for one tenant, which defeats the point; enforcement is a
 * property of the environment, not of the tenant.
 */
@Injectable()
export class SafelistService {
  private readonly logger = new Logger(SafelistService.name)

  /** Memoized enforcement flag; see isEnforced(). */
  private enforcedCache?: { value: boolean; expiresAt: number }
  private enforcedLookup?: Promise<boolean>

  constructor(
    @InjectRepository(RecipientSafelist)
    private readonly safelistRepository: Repository<RecipientSafelist>,
    @InjectRepository(NotifyConfiguration)
    private readonly configurationRepository: Repository<NotifyConfiguration>,
    private readonly featureFlagService: FeatureFlagService,
  ) {}

  /**
   * Whether this environment enforces the safelist at all. False in PROD.
   *
   * Cached for ENFORCED_CACHE_TTL_MS because this is consulted on every send, and the answer is
   * a property of the environment that changes only when an operator toggles the flag. Without
   * the cache PROD pays a feature_flag query per notification to be told "no" every time.
   *
   * Consequences of the cache, both deliberate:
   *   - Toggling the flag takes up to the TTL to take effect. Acceptable for a switch that is
   *     flipped when an environment is set up, not per request.
   *   - FeatureFlagService.isEnabled already fails to `false` (open) on a database error, so a
   *     blip during a refresh can leave enforcement off for up to the TTL rather than for the
   *     length of the blip. The TTL is kept short to bound that.
   */
  async isEnforced(): Promise<boolean> {
    const now = Date.now()
    if (this.enforcedCache && this.enforcedCache.expiresAt > now) {
      return this.enforcedCache.value
    }

    // Share one in-flight lookup so a burst of concurrent sends does not each hit the database.
    this.enforcedLookup ??= this.featureFlagService
      .isEnabled(FeatureFlagCode.RECIPIENT_SAFELIST)
      .then((value) => {
        this.enforcedCache = { value, expiresAt: Date.now() + ENFORCED_CACHE_TTL_MS }
        return value
      })
      .finally(() => {
        this.enforcedLookup = undefined
      })

    return this.enforcedLookup
  }

  /**
   * Return the subset of `candidates` that may NOT be sent to, preserving the caller's original
   * address strings so error messages echo what was submitted. Returns an empty array when
   * enforcement is off, which is the only path PROD ever takes.
   *
   * Channels outside the safelist's scope (currently anything but EMAIL/SMS) are never blocked.
   */
  async findBlocked(tenantId: string, candidates: SafelistCandidate[]): Promise<string[]> {
    if (candidates.length === 0) return []
    if (!(await this.isEnforced())) return []

    const inScope = candidates.filter(({ channel }) => this.appliesTo(channel))
    if (inScope.length === 0) return []

    const allowed = await this.loadAllowed(tenantId)

    const blocked: string[] = []
    for (const { address, channel } of inScope) {
      const normalized = normalizeRecipient(channel, address)
      // An address that will not normalize cannot match any entry; treat it as blocked rather
      // than letting an unparseable value through the guardrail.
      if (!normalized || !allowed.get(channel)?.has(normalized)) {
        blocked.push(address)
      }
    }
    return blocked
  }

  /** Whether the safelist governs a given channel. */
  appliesTo(channel: string): boolean {
    return channel === 'EMAIL' || channel === 'SMS'
  }

  /**
   * List a tenant's entries, resolving `created_by` to a display name in the same query.
   *
   * `created_by` holds the IDIR GUID from the request, which is not something to put on screen.
   * notify_user.external_id is that same GUID, so the name comes from a join — safe because V51
   * makes external_id unique among active users; without that constraint a duplicate user row
   * would silently duplicate the safelist entry.
   *
   * The join is written here rather than declared as a relation on the entity on purpose:
   * `created_by` is not a foreign key. It also carries non-user markers ('system', 'migration')
   * written by seed data, which are passed through as-is below; an unresolved GUID becomes null
   * rather than leaking the raw identifier.
   */
  async listByTenant(tenantId: string, channelCode?: string): Promise<SafelistEntryDto[]> {
    const query = this.safelistRepository
      .createQueryBuilder('entry')
      // Alias is 'adder', not 'user': `user` is a reserved word in Postgres and an unquoted
      // reference to it is a syntax error. All-lowercase so the unquoted references below match
      // the alias TypeORM emits quoted.
      .leftJoin(
        NotifyUser,
        'adder',
        'adder.external_id = entry.created_by AND adder.is_deleted = FALSE',
      )
      .addSelect('COALESCE(adder.display_name, adder.username, adder.email)', 'createdByName')
      .where('entry.tenant_id = :tenantId', { tenantId })
      .andWhere('entry.is_deleted = FALSE')
      .orderBy('entry.channel_code', 'ASC')
      .addOrderBy('entry.recipient_normalized', 'ASC')

    if (channelCode) {
      query.andWhere('entry.channel_code = :channelCode', { channelCode })
    }

    // Row order is shared between `entities` and `raw`, and the unique index guarantees at most
    // one user per entry, so the two line up index for index.
    const { entities, raw } = await query.getRawAndEntities()

    return entities.map((entry, index) => ({
      ...entry,
      createdByName: raw[index]?.createdByName ?? this.fallbackCreatedByName(entry.createdBy),
    }))
  }

  /**
   * What to show when the join found no user: the stored value if it is one of the non-GUID
   * markers seed data writes, otherwise null so a bare GUID never reaches the screen.
   */
  private fallbackCreatedByName(createdBy: string | null): string | null {
    if (!createdBy) return null
    return UUID_PATTERN.test(createdBy) ? null : createdBy
  }

  async add(
    tenantId: string,
    dto: CreateSafelistEntryDto,
    createdBy?: string,
  ): Promise<RecipientSafelist> {
    const recipient = dto.recipient.trim()

    if (!isValidRecipient(dto.channelCode, recipient)) {
      throw new BadRequestException(
        dto.channelCode === 'EMAIL'
          ? `"${recipient}" is not a valid email address`
          : `"${recipient}" is not a valid phone number`,
      )
    }

    const recipientNormalized = normalizeRecipient(dto.channelCode, recipient)
    if (!recipientNormalized) {
      throw new BadRequestException(`"${recipient}" could not be interpreted as a recipient`)
    }

    const existing = await this.safelistRepository.findOne({
      where: { tenantId, channelCode: dto.channelCode, recipientNormalized, isDeleted: false },
    })
    if (existing) {
      throw new ConflictException(
        `${recipient} is already on the ${dto.channelCode} safelist for this tenant`,
      )
    }

    const maxEntries = await this.getMaxEntries()
    const currentCount = await this.safelistRepository.count({
      where: { tenantId, isDeleted: false },
    })
    if (currentCount >= maxEntries) {
      throw new BadRequestException(
        `Safelist is full (${maxEntries} entries). Remove an entry before adding another.`,
      )
    }

    const entry = this.safelistRepository.create({
      tenantId,
      channelCode: dto.channelCode,
      recipient,
      recipientNormalized,
      label: dto.label?.trim() || null,
      createdBy: createdBy ?? null,
      updatedBy: createdBy ?? null,
    })

    const saved = await this.safelistRepository.save(entry)
    this.logger.log(
      `Safelist entry added (tenant=${tenantId}, channel=${dto.channelCode}, id=${saved.id})`,
    )
    return saved
  }

  /** Soft delete: the row stays for the audit trail and stops permitting sends immediately. */
  async remove(tenantId: string, id: string, updatedBy?: string): Promise<void> {
    const entry = await this.safelistRepository.findOne({
      where: { id, tenantId, isDeleted: false },
    })
    if (!entry) {
      throw new NotFoundException('Safelist entry not found')
    }

    entry.isDeleted = true
    entry.updatedBy = updatedBy ?? entry.updatedBy
    await this.safelistRepository.save(entry)
    this.logger.log(`Safelist entry removed (tenant=${tenantId}, id=${id})`)
  }

  /** Per-tenant cap, falling back to the global notify.configuration value. */
  async getMaxEntries(): Promise<number> {
    try {
      const row = await this.configurationRepository.findOne({ where: { key: MAX_ENTRIES_KEY } })
      const value = Number(row?.config?.value)
      return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_ENTRIES
    } catch (error) {
      this.logger.warn(
        `Failed to read ${MAX_ENTRIES_KEY} configuration, using default ${DEFAULT_MAX_ENTRIES}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return DEFAULT_MAX_ENTRIES
    }
  }

  /** All active entries for a tenant, indexed by channel for O(1) membership checks. */
  private async loadAllowed(tenantId: string): Promise<Map<string, Set<string>>> {
    const entries = await this.safelistRepository.find({
      where: { tenantId, isDeleted: false },
      select: { channelCode: true, recipientNormalized: true },
    })

    const byChannel = new Map<string, Set<string>>()
    for (const { channelCode, recipientNormalized } of entries) {
      const set = byChannel.get(channelCode) ?? new Set<string>()
      set.add(recipientNormalized)
      byChannel.set(channelCode, set)
    }
    return byChannel
  }
}
