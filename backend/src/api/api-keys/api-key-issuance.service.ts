import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomBytes } from 'crypto'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ApiKeyConsumer, ApiKeyIssuedVia } from './entities/api-key-consumer.entity'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { ApiKeysService } from './api-keys.service'
import { ApiKeySummaryDto, IssuedApiKeyDto } from './schemas/api-key-response.dto'
import {
  CREDENTIAL_ISSUER,
  type CredentialIssuer,
} from '../../services/credential-issuer/credential-issuer.interface'

/**
 * How many keys Notify will issue for one tenant.
 *
 * One. A tenant needing a fresh value uses regenerate, which keeps the same clientId and
 * so keeps limits, usage history and alert configuration intact.
 *
 * This is also enforced by a partial unique index (migration V55), because the check
 * below cannot be: two concurrent requests both read a count of zero and both issue.
 * That matters more than usual here — every extra key is an Application and Consumer on
 * a shared gateway that no API can delete.
 *
 * Raising it therefore takes three changes, not one: this constant, dropping
 * `uq_api_key_consumer_one_self_service_per_tenant`, and confirming the endpoints still
 * behave when listForTenant returns several manageable keys (the UI currently assumes
 * one).
 */
export const MAX_KEYS_PER_TENANT = 1

/** Postgres unique-violation SQLSTATE. */
const PG_UNIQUE_VIOLATION = '23505'

@Injectable()
export class ApiKeyIssuanceService {
  private readonly logger = new Logger(ApiKeyIssuanceService.name)

  constructor(
    @InjectRepository(ApiKeyConsumer)
    private readonly apiKeyConsumerRepository: Repository<ApiKeyConsumer>,
    @Inject(CREDENTIAL_ISSUER)
    private readonly credentialIssuer: CredentialIssuer,
    private readonly apiKeysService: ApiKeysService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Issue a new gateway API key and bind it to the tenant in one step.
   *
   * This replaces the old three-step dance (request a key in the API Services Portal,
   * create the tenant in CSTAR, bind the two together by hand). The tenant already
   * exists and the caller has already proven membership of it — the guard did that —
   * so the key can be minted and bound without any manual step.
   *
   * The returned `apiKey` is the only copy. Notify stores identifiers, never the value.
   */
  async issueForTenant(params: {
    tenant: Tenant
    idirUserGuid: string
    notes?: string | null
  }): Promise<IssuedApiKeyDto> {
    const { tenant, idirUserGuid, notes } = params

    // Only keys Notify issued count against the cap. A key bound through the legacy
    // Postman flow has no clientId, so Notify cannot rotate it — counting it would
    // leave that tenant unable to generate *or* regenerate, with no way out of the UI.
    // Issuing alongside it is the migration path: cut over, then retire the old key on
    // the API Services Portal.
    const managedCount = await this.apiKeyConsumerRepository.count({
      where: { tenantId: tenant.id, issuedVia: ApiKeyIssuedVia.SELF_SERVICE },
    })
    if (managedCount >= MAX_KEYS_PER_TENANT) {
      throw new ConflictException(
        MAX_KEYS_PER_TENANT === 1
          ? 'This tenant already has an API key. Regenerate it to get a new value.'
          : `This tenant already has ${MAX_KEYS_PER_TENANT} API keys, the maximum Notify will issue.`,
      )
    }

    const applicationName = this.buildApplicationName(tenant)

    const credential = await this.credentialIssuer.issue({
      applicationName,
      applicationDescription: `Notify API key for tenant ${tenant.name}`,
      // Kong forwards ACL groups to the upstream as X-Consumer-Groups, so this is what
      // puts the tenant's CSTAR id into a request header — the one supported way to
      // identify a tenant without a database lookup. APS's own spec example does the
      // same thing. Ignored on a kong-api-key-only environment (no ACL plugin), so it
      // is harmless to send today and ready when the environment moves to -acl.
      ...(tenant.externalId ? { aclGroups: [tenant.externalId] } : {}),
      labels: {
        'issued-by': 'notify',
        'notify-tenant': tenant.slug,
        // The CSTAR tenant id, not Notify's internal primary key. These labels exist to
        // be read on the Portal Consumers page by someone cross-referencing a consumer
        // against another system, and CSTAR is the identifier those systems share —
        // Notify's row id means nothing outside our own database.
        //
        // Omitted rather than sent empty when a tenant has no CSTAR id (the column is
        // nullable, and the load-test tenant is one such), since a label whose value is
        // blank is worse than an absent one.
        ...(tenant.externalId ? { 'cstar-tenant-id': tenant.externalId } : {}),
      },
    })

    if (!credential.apiKey) {
      // Notify's gateway environments are on an api-key flow (kong-api-key-only). A
      // credential with no apiKey means this environment is client-credentials, which
      // this endpoint has nothing useful to hand back for.
      this.logger.error(
        `Credential issuer returned a ${credential.flow} credential with no apiKey for tenant ${tenant.id}`,
      )
      throw new BadRequestException(
        'The gateway environment is not configured to issue API keys. Contact the Notify team.',
      )
    }

    const now = new Date()
    let binding: ApiKeyConsumer
    try {
      binding = await this.apiKeyConsumerRepository.save(
        this.apiKeyConsumerRepository.create({
          credentialIdentifier: credential.credentialIdentifier ?? null,
          clientId: credential.clientId,
          applicationAppId: this.deriveApplicationAppId(credential.clientId),
          notes: notes?.trim() || null,
          tenantId: tenant.id,
          boundByIdirGuid: idirUserGuid,
          issuedVia: ApiKeyIssuedVia.SELF_SERVICE,
          issuedAt: now,
          createdAt: now,
          updatedAt: now,
        }),
      )
    } catch (error) {
      // Lost a race with a concurrent issue for the same tenant. The count check above
      // passed for both callers; the partial unique index from V55 is what actually
      // holds the limit.
      //
      // The credential has already been created at the gateway and cannot be deleted
      // through the API, so it is logged loudly with its clientId: someone has to remove
      // it from the Portal Consumers page by hand.
      if ((error as { code?: string })?.code === PG_UNIQUE_VIOLATION) {
        this.logger.error(
          `Concurrent issue for tenant ${tenant.id} lost the race after the gateway had ` +
            `already created ${credential.clientId}. That consumer is now orphaned and must ` +
            'be revoked manually on the API Services Portal Consumers page.',
        )
        throw new ConflictException(
          'This tenant already has an API key. Regenerate it to get a new value.',
        )
      }
      throw error
    }

    // Same per-channel limits and alert thresholds a bound key gets.
    await this.apiKeysService.ensureDefaults(binding.id)

    this.logger.log(
      `Issued API key ${credential.clientId} for tenant "${tenant.name}" (${tenant.id}) ` +
        `via ${this.credentialIssuer.name}, requested by ${idirUserGuid}`,
    )

    return { ...this.toSummary(binding), apiKey: credential.apiKey, flow: credential.flow }
  }

  /**
   * Keys bound to a tenant, newest first. Values are never included.
   *
   * This lists what Notify issued or had bound to it, which is not quite the same as
   * what the gateway will currently accept: a key revoked on the API Services Portal
   * still appears here, because the Credential Issuer API offers no way to read
   * consumer state back.
   */
  async listForTenant(tenantId: string): Promise<ApiKeySummaryDto[]> {
    const bindings = await this.apiKeyConsumerRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    })
    return bindings.map((binding) => this.toSummary(binding))
  }

  /**
   * Rotate a key's value in place. The clientId survives, so limits, usage history and
   * alert configuration all carry over — callers only need to swap the key value.
   */
  async regenerate(params: {
    tenantId: string
    clientId: string
    idirUserGuid: string
  }): Promise<IssuedApiKeyDto> {
    const { tenantId, clientId, idirUserGuid } = params
    const binding = await this.requireBinding(tenantId, clientId)
    this.assertManageable(binding)

    const credential = await this.credentialIssuer.regenerate(clientId)

    if (!credential.apiKey) {
      this.logger.error(
        `Credential issuer returned a ${credential.flow} credential with no apiKey when regenerating ${clientId}`,
      )
      throw new BadRequestException(
        'The gateway environment is not configured to issue API keys. Contact the Notify team.',
      )
    }

    const now = new Date()
    // The old credential is gone, and with it the credential id we had cached. Clear it
    // so tenant resolution falls back to the clientId and re-learns the new one on the
    // first request made with the new key.
    binding.credentialIdentifier = credential.credentialIdentifier ?? null
    binding.lastRegeneratedAt = now
    binding.updatedAt = now
    await this.apiKeyConsumerRepository.save(binding)

    this.logger.log(
      `Regenerated API key ${clientId} for tenant ${tenantId}, requested by ${idirUserGuid}`,
    )

    return { ...this.toSummary(binding), apiKey: credential.apiKey, flow: credential.flow }
  }

  /**
   * Edit the free-text note on a key.
   *
   * Separate from issuing because of the order the user works in: the key is generated,
   * shown once, and only then does the user write down where they put it.
   */
  async updateNotes(params: {
    tenantId: string
    clientId: string
    notes: string | null | undefined
  }): Promise<ApiKeySummaryDto> {
    const { tenantId, clientId, notes } = params
    const binding = await this.requireBinding(tenantId, clientId)

    binding.notes = typeof notes === 'string' ? notes.trim() || null : null
    binding.updatedAt = new Date()
    await this.apiKeyConsumerRepository.save(binding)

    return this.toSummary(binding)
  }

  // Revocation is deliberately absent. It happens on the API Services Portal Consumers
  // page, which is where the gateway actually stops honouring the key. Notify offering
  // its own "revoke" would only unbind the key locally while it stayed live at the
  // gateway — two different meanings of the same word, and the weaker one.

  private async requireBinding(tenantId: string, clientId: string): Promise<ApiKeyConsumer> {
    const binding = await this.apiKeyConsumerRepository.findOne({ where: { clientId } })

    // Same 404 whether the key does not exist or belongs to another tenant: a tenant
    // should not be able to probe for other tenants' clientIds.
    if (!binding || binding.tenantId !== tenantId) {
      throw new NotFoundException(`No API key "${clientId}" exists for this tenant`)
    }

    return binding
  }

  /**
   * Keys bound through the legacy Postman flow carry no clientId, so the gateway has
   * no handle Notify can rotate or annotate. They remain valid for authentication —
   * tenant resolution still finds them by credential identifier — they simply cannot
   * be managed from here.
   */
  static isManageable(binding: Pick<ApiKeyConsumer, 'issuedVia' | 'clientId'>): boolean {
    return binding.issuedVia === ApiKeyIssuedVia.SELF_SERVICE && Boolean(binding.clientId)
  }

  private assertManageable(binding: ApiKeyConsumer): void {
    if (ApiKeyIssuanceService.isManageable(binding)) return

    throw new BadRequestException(
      'This API key was bound outside Notify and cannot be regenerated here. ' +
        'Generate a new key, move your integration onto it, then revoke the old one on the ' +
        'API Services Portal.',
    )
  }

  /**
   * Build the Application name shown on the gateway Consumers page.
   *
   * Prefixed with `notify-` and the tenant slug so a Notify-issued key is identifiable
   * at a glance on a gateway shared across the whole ministry.
   *
   * The random suffix is not decoration. APS refuses a second credential for the same
   * Application in the same Environment, and Applications cannot be deleted through the
   * API — so any name that repeats is permanently unusable. Without a discriminator,
   * re-issuing after a binding row is removed from the database (entirely plausible
   * during this rollout) would 409 forever, and raising MAX_KEYS_PER_TENANT above 1
   * would never work at all.
   */
  private buildApplicationName(tenant: Tenant): string {
    const slug = tenant.slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    // The CSTAR guid rather than Notify's row id, so the Consumers page is searchable by
    // the identifier other systems share. The slug rides along because a bare guid is
    // unreadable when scanning a page of consumers.
    //
    // The random suffix stays even with the guid present. APS refuses a second
    // credential for the same Application in the same Environment and cannot delete
    // Applications, so any name that repeats is permanently unusable — a re-issue after
    // a binding row was cleaned up by hand would 409 forever.
    const parts = ['notify', slug.slice(0, 24), tenant.externalId, randomBytes(3).toString('hex')]
    return parts.filter(Boolean).join('-')
  }

  /**
   * Split the Application id out of `{environmentAppId}-{applicationAppId}`.
   *
   * Strips the configured environment prefix rather than splitting on the first
   * hyphen, because an environmentAppId may itself contain one.
   */
  private deriveApplicationAppId(clientId: string): string | null {
    const environmentAppId = this.configService.get<string>('aps.environmentAppId')

    if (environmentAppId && clientId.startsWith(`${environmentAppId}-`)) {
      return clientId.slice(environmentAppId.length + 1)
    }

    const separator = clientId.indexOf('-')
    return separator > 0 ? clientId.slice(separator + 1) : null
  }

  private toSummary(binding: ApiKeyConsumer): ApiKeySummaryDto {
    return {
      id: binding.id,
      clientId: binding.clientId ?? undefined,
      notes: binding.notes ?? null,
      issuedVia: binding.issuedVia,
      issuedAt: binding.issuedAt ?? undefined,
      lastRegeneratedAt: binding.lastRegeneratedAt ?? undefined,
      // Rotating replaces the value, so "created" has to follow the rotation rather
      // than stay pinned to when the key first existed.
      currentKeyCreatedAt:
        binding.lastRegeneratedAt ?? binding.issuedAt ?? binding.createdAt ?? undefined,
      issuedByIdirGuid: binding.boundByIdirGuid ?? undefined,
      activated: Boolean(binding.credentialIdentifier),
      manageable: ApiKeyIssuanceService.isManageable(binding),
      createdAt: binding.createdAt,
    }
  }
}
