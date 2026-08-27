import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ApiKeyIssuanceService, MAX_KEYS_PER_TENANT } from './api-key-issuance.service'
import { ApiKeyConsumer, ApiKeyIssuedVia } from './entities/api-key-consumer.entity'
import { ApiKeysService } from './api-keys.service'
import { CREDENTIAL_ISSUER } from '../../services/credential-issuer/credential-issuer.interface'
import type { Tenant } from '../admin/tenants/entities/tenant.entity'

const TENANT = {
  id: 'tenant-uuid',
  name: 'Tenant A',
  slug: 'tenant-a',
  externalId: 'cstar-guid',
} as Tenant

const ISSUED_CREDENTIAL = {
  flow: 'kong-api-key-only',
  clientId: 'ENV123-APP456',
  apiKey: 'the-only-copy',
}

describe('ApiKeyIssuanceService', () => {
  let service: ApiKeyIssuanceService
  let repository: {
    count: ReturnType<typeof vi.fn>
    find: ReturnType<typeof vi.fn>
    findOne: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    save: ReturnType<typeof vi.fn>
  }
  let credentialIssuer: {
    name: string
    isConfigured: ReturnType<typeof vi.fn>
    issue: ReturnType<typeof vi.fn>
    regenerate: ReturnType<typeof vi.fn>
  }
  let apiKeysService: { ensureDefaults: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    repository = {
      count: vi.fn().mockResolvedValue(0),
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((data) => ({ id: 'binding-uuid', ...data })),
      save: vi.fn().mockImplementation((entity) => Promise.resolve(entity)),
    }

    credentialIssuer = {
      name: 'test-issuer',
      isConfigured: vi.fn().mockReturnValue(true),
      issue: vi.fn().mockResolvedValue({ ...ISSUED_CREDENTIAL }),
      regenerate: vi.fn().mockResolvedValue({ ...ISSUED_CREDENTIAL, apiKey: 'rotated' }),
    }

    apiKeysService = { ensureDefaults: vi.fn().mockResolvedValue(undefined) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyIssuanceService,
        { provide: getRepositoryToken(ApiKeyConsumer), useValue: repository },
        { provide: CREDENTIAL_ISSUER, useValue: credentialIssuer },
        { provide: ApiKeysService, useValue: apiKeysService },
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('ENV123') },
        },
      ],
    }).compile()

    service = module.get(ApiKeyIssuanceService)
  })

  const issue = () => service.issueForTenant({ tenant: TENANT, idirUserGuid: 'idir-guid' })

  describe('issueForTenant', () => {
    it('issues a credential and binds it to the tenant in one step', async () => {
      const result = await issue()

      expect(credentialIssuer.issue).toHaveBeenCalledWith({
        // Carries the CSTAR guid so the Consumers page is searchable by it, and a
        // discriminator because a repeated name is permanently unusable.
        applicationName: expect.stringMatching(/^notify-tenant-a-cstar-guid-[0-9a-f]{6}$/),
        // Kong forwards ACL groups as X-Consumer-Groups — the one supported way to get
        // the tenant into a request header.
        aclGroups: ['cstar-guid'],
        applicationDescription: 'Notify API key for tenant Tenant A',
        labels: {
          'issued-by': 'notify',
          'notify-tenant': 'tenant-a',
          // The CSTAR guid, not the Notify row id — see the service for why.
          'cstar-tenant-id': 'cstar-guid',
        },
      })

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'ENV123-APP456',
          applicationAppId: 'APP456',
          notes: null,
          tenantId: 'tenant-uuid',
          boundByIdirGuid: 'idir-guid',
          issuedVia: ApiKeyIssuedVia.SELF_SERVICE,
          // APS does not reveal Kong's credential id at issue time; it is learned on
          // the first authenticated request.
          credentialIdentifier: null,
        }),
      )
      expect(result.apiKey).toBe('the-only-copy')
      expect(result.clientId).toBe('ENV123-APP456')
      expect(result.activated).toBe(false)
    })

    it('omits the CSTAR label rather than sending it empty when the tenant has none', async () => {
      await service.issueForTenant({
        tenant: { ...TENANT, externalId: null } as unknown as Tenant,
        idirUserGuid: 'idir-guid',
      })

      const call = credentialIssuer.issue.mock.calls[0][0]
      expect(call.labels).not.toHaveProperty('cstar-tenant-id')
      expect(call.labels['notify-tenant']).toBe('tenant-a')
      // No guid means no group to send; an empty ACL group would be meaningless.
      expect(call).not.toHaveProperty('aclGroups')
    })

    it('seeds the same default limits a bound key gets', async () => {
      await issue()

      expect(apiKeysService.ensureDefaults).toHaveBeenCalledWith('binding-uuid')
    })

    it('records the credential identifier when the issuer knows it', async () => {
      credentialIssuer.issue.mockResolvedValue({
        ...ISSUED_CREDENTIAL,
        credentialIdentifier: 'kong-credential-uuid',
      })

      const result = await issue()

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ credentialIdentifier: 'kong-credential-uuid' }),
      )
      expect(result.activated).toBe(true)
    })

    it('refuses a second key while the tenant already holds one', async () => {
      repository.count.mockResolvedValue(MAX_KEYS_PER_TENANT)

      await expect(issue()).rejects.toThrow(ConflictException)
      expect(credentialIssuer.issue).not.toHaveBeenCalled()
    })

    it('points the caller at regenerate rather than just refusing', async () => {
      repository.count.mockResolvedValue(MAX_KEYS_PER_TENANT)

      await expect(issue()).rejects.toThrow(/[Rr]egenerate/)
    })

    it('counts only the keys Notify can manage', async () => {
      await issue()

      // A legacy Postman-bound key has no clientId to rotate against, so counting it
      // would leave that tenant unable to generate or regenerate — stuck.
      expect(repository.count).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-uuid', issuedVia: ApiKeyIssuedVia.SELF_SERVICE },
      })
    })

    it('stores a trimmed note when one is supplied', async () => {
      await service.issueForTenant({
        tenant: TENANT,
        idirUserGuid: 'idir-guid',
        notes: '  OpenShift secret  ',
      })

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ notes: 'OpenShift secret' }),
      )
    })

    it('fails clearly when the environment is not an api-key flow', async () => {
      credentialIssuer.issue.mockResolvedValue({
        flow: 'client-credentials',
        clientId: 'ENV123-APP456',
        clientSecret: 'oauth-secret',
      })

      await expect(issue()).rejects.toThrow(BadRequestException)
      expect(repository.save).not.toHaveBeenCalled()
    })

    it('derives the gateway application name from the tenant slug', async () => {
      await service.issueForTenant({
        tenant: { ...TENANT, slug: 'Air_Quality Alert' } as typeof TENANT,
        idirUserGuid: 'idir-guid',
      })

      expect(credentialIssuer.issue).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationName: expect.stringMatching(
            /^notify-air-quality-alert-cstar-guid-[0-9a-f]{6}$/,
          ),
        }),
      )
    })

    it('never reuses an application name', async () => {
      // APS refuses a second credential for the same Application in an Environment and
      // cannot delete Applications, so a repeated name is permanently unusable — which
      // would bite on any re-issue after a binding row was cleaned up by hand.
      await issue()
      await issue()

      const [first, second] = credentialIssuer.issue.mock.calls.map((c) => c[0].applicationName)
      expect(first).not.toBe(second)
    })

    it('reports a lost concurrency race as a conflict, and logs the orphaned consumer', async () => {
      // The count check cannot hold under concurrency; the partial unique index from V55
      // does. The credential already exists at the gateway by this point and no API can
      // remove it, so the clientId has to reach the logs.
      const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' })
      repository.save.mockRejectedValueOnce(uniqueViolation)
      const logError = vi
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined)

      await expect(issue()).rejects.toThrow(ConflictException)
      expect(logError.mock.calls.flat().join(' ')).toMatch(/ENV123-APP456/)
    })

    it('does not disguise an unrelated database failure as a conflict', async () => {
      repository.save.mockRejectedValueOnce(new Error('connection reset'))

      await expect(issue()).rejects.toThrow(/connection reset/)
    })
  })

  describe('regenerate', () => {
    const binding = () =>
      ({
        id: 'binding-uuid',
        clientId: 'ENV123-APP456',
        tenantId: 'tenant-uuid',
        credentialIdentifier: 'stale-kong-credential',
        notes: 'OpenShift secret',
        issuedVia: ApiKeyIssuedVia.SELF_SERVICE,
        createdAt: new Date('2026-01-01'),
      }) as ApiKeyConsumer

    it('rotates the value and forgets the now-dead credential identifier', async () => {
      const existing = binding()
      repository.findOne.mockResolvedValue(existing)

      const result = await service.regenerate({
        tenantId: 'tenant-uuid',
        clientId: 'ENV123-APP456',
        idirUserGuid: 'idir-guid',
      })

      expect(result.apiKey).toBe('rotated')
      // Kong minted a new credential, so the cached id no longer matches anything.
      expect(existing.credentialIdentifier).toBeNull()
      expect(existing.lastRegeneratedAt).toBeInstanceOf(Date)
      expect(repository.save).toHaveBeenCalledWith(existing)
    })

    it('does not let one tenant rotate another tenant’s key', async () => {
      repository.findOne.mockResolvedValue({ ...binding(), tenantId: 'someone-else' })

      await expect(
        service.regenerate({
          tenantId: 'tenant-uuid',
          clientId: 'ENV123-APP456',
          idirUserGuid: 'idir-guid',
        }),
      ).rejects.toThrow(NotFoundException)
      expect(credentialIssuer.regenerate).not.toHaveBeenCalled()
    })

    it('refuses to regenerate a key bound outside Notify, and says what to do instead', async () => {
      repository.findOne.mockResolvedValue({
        id: 'legacy-uuid',
        clientId: null,
        tenantId: 'tenant-uuid',
        issuedVia: ApiKeyIssuedVia.BIND,
      })

      await expect(
        service.regenerate({ tenantId: 'tenant-uuid', clientId: 'x', idirUserGuid: 'g' }),
      ).rejects.toThrow(/Generate a new key/)
      expect(credentialIssuer.regenerate).not.toHaveBeenCalled()
    })

    it('404s on an unknown clientId', async () => {
      repository.findOne.mockResolvedValue(null)

      await expect(
        service.regenerate({
          tenantId: 'tenant-uuid',
          clientId: 'nope',
          idirUserGuid: 'idir-guid',
        }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('updateNotes', () => {
    const existingBinding = () =>
      ({
        id: 'binding-uuid',
        clientId: 'ENV123-APP456',
        tenantId: 'tenant-uuid',
        notes: 'old note',
        issuedVia: ApiKeyIssuedVia.SELF_SERVICE,
        createdAt: new Date('2026-01-01'),
      }) as ApiKeyConsumer

    it('trims and stores the note', async () => {
      const existing = existingBinding()
      repository.findOne.mockResolvedValue(existing)

      const result = await service.updateNotes({
        tenantId: 'tenant-uuid',
        clientId: 'ENV123-APP456',
        notes: '  OpenShift secret  ',
      })

      expect(existing.notes).toBe('OpenShift secret')
      expect(result.notes).toBe('OpenShift secret')
    })

    it('clears the note when given null or blank text', async () => {
      const existing = existingBinding()
      repository.findOne.mockResolvedValue(existing)

      await service.updateNotes({ tenantId: 'tenant-uuid', clientId: 'ENV123-APP456', notes: null })
      expect(existing.notes).toBeNull()

      existing.notes = 'something'
      await service.updateNotes({
        tenantId: 'tenant-uuid',
        clientId: 'ENV123-APP456',
        notes: '   ',
      })
      expect(existing.notes).toBeNull()
    })

    it('does not let one tenant edit another tenant\u2019s key', async () => {
      repository.findOne.mockResolvedValue({ ...existingBinding(), tenantId: 'someone-else' })

      await expect(
        service.updateNotes({ tenantId: 'tenant-uuid', clientId: 'ENV123-APP456', notes: 'x' }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('listForTenant', () => {
    it('returns metadata only, never a key value', async () => {
      repository.find.mockResolvedValue([
        {
          id: 'binding-uuid',
          clientId: 'ENV123-APP456',
          notes: 'OpenShift secret',
          issuedVia: ApiKeyIssuedVia.SELF_SERVICE,
          issuedAt: new Date('2026-01-01'),
          lastRegeneratedAt: null,
          boundByIdirGuid: 'idir-guid',
          credentialIdentifier: 'kong-credential-uuid',
          createdAt: new Date('2026-01-01'),
        },
      ])

      const [summary] = await service.listForTenant('tenant-uuid')

      expect(summary).not.toHaveProperty('apiKey')
      expect(summary.activated).toBe(true)
      expect(summary.manageable).toBe(true)
      expect(summary.notes).toBe('OpenShift secret')
      expect(repository.find).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-uuid' },
        order: { createdAt: 'DESC' },
      })
    })
  })
})
