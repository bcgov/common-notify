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
import { RecipientSafelist } from './entities/recipient-safelist.entity'
import { CreateSafelistEntryDto } from './schemas/create-safelist-entry.dto'
import { isValidRecipient, normalizeRecipient } from './safelist.util'

const MAX_ENTRIES_KEY = 'safelist_max_entries'
const DEFAULT_MAX_ENTRIES = 50

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

  constructor(
    @InjectRepository(RecipientSafelist)
    private readonly safelistRepository: Repository<RecipientSafelist>,
    @InjectRepository(NotifyConfiguration)
    private readonly configurationRepository: Repository<NotifyConfiguration>,
    private readonly featureFlagService: FeatureFlagService,
  ) {}

  /** Whether this environment enforces the safelist at all. False in PROD. */
  async isEnforced(): Promise<boolean> {
    return this.featureFlagService.isEnabled(FeatureFlagCode.RECIPIENT_SAFELIST)
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

  async listByTenant(tenantId: string, channelCode?: string): Promise<RecipientSafelist[]> {
    const where: Record<string, unknown> = { tenantId, isDeleted: false }
    if (channelCode) where.channelCode = channelCode

    return this.safelistRepository.find({
      where,
      order: { channelCode: 'ASC', recipientNormalized: 'ASC' },
    })
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
