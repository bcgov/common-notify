import { Logger } from '@nestjs/common'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { In, IsNull, Repository } from 'typeorm'
import { ApiKeyConsumer } from '../../api/api-keys/entities/api-key-consumer.entity'
import {
  describeGatewayHeaders,
  hasNoCredentialHeaders,
  readGatewayCredentialHeaders,
  resolveApiKeyConsumer,
} from './resolve-api-key-consumer'

describe('readGatewayCredentialHeaders', () => {
  it('picks up every identifying header the gateway injects', () => {
    expect(
      readGatewayCredentialHeaders({
        'x-credential-identifier': 'cred-1',
        'x-consumer-username': 'ENV123-APP456',
        'x-consumer-custom-id': 'ENV123-APP456',
        'x-consumer-id': 'kong-consumer-uuid',
      }),
    ).toEqual({
      credentialIdentifier: 'cred-1',
      consumerUsername: 'ENV123-APP456',
      consumerCustomId: 'ENV123-APP456',
      consumerId: 'kong-consumer-uuid',
      consumerGroups: [],
    })
  })

  it('splits the ACL groups Kong joined together', () => {
    const headers = readGatewayCredentialHeaders({
      'x-consumer-groups': 'cstar-guid, ENV123',
    })

    expect(headers.consumerGroups).toEqual(['cstar-guid', 'ENV123'])
  })

  it('treats a consumer in no groups as no groups', () => {
    // Kong emits the header even when the consumer belongs to nothing.
    expect(readGatewayCredentialHeaders({ 'x-consumer-groups': '' }).consumerGroups).toEqual([])
  })

  it('ignores empty and non-string header values', () => {
    const headers = readGatewayCredentialHeaders({
      'x-credential-identifier': '',
      'x-consumer-username': ['a', 'b'],
    })

    expect(headers.credentialIdentifier).toBeUndefined()
    expect(headers.consumerUsername).toBeUndefined()
  })
})

describe('describeGatewayHeaders', () => {
  it('reports every injected header, including ones we do not consume', () => {
    // Logs every injected header, not just the ones resolution consumes, so the line
    // still shows anything the gateway starts sending that we do not yet read.
    const described = describeGatewayHeaders({
      'x-credential-identifier': 'cred-1',
      'x-consumer-username': 'ENV123-APP456',
      'x-consumer-groups': 'ENV123, e936010f-bb93-4430-87d9',
      authorization: 'Bearer should-not-appear',
      'x-api-key': 'should-not-appear',
    })

    expect(described).toMatch(/x-consumer-groups=ENV123, e936010f/)
    expect(described).toMatch(/x-consumer-username=ENV123-APP456/)
    // The key itself and the bearer token are not gateway-injected identity.
    expect(described).not.toMatch(/should-not-appear/)
  })

  it('says so plainly when the gateway injected nothing', () => {
    expect(describeGatewayHeaders({ host: 'x' })).toBe('(none)')
  })
})

describe('hasNoCredentialHeaders', () => {
  it('is true when the gateway identified nothing', () => {
    expect(hasNoCredentialHeaders({})).toBe(true)
    // x-consumer-id alone cannot resolve a binding — it is stored for audit only.
    expect(hasNoCredentialHeaders({ consumerId: 'kong-consumer-uuid' })).toBe(true)
  })

  it('is false when either identifier is present', () => {
    expect(hasNoCredentialHeaders({ credentialIdentifier: 'cred-1' })).toBe(false)
    expect(hasNoCredentialHeaders({ consumerUsername: 'ENV123-APP456' })).toBe(false)
  })
})

describe('resolveApiKeyConsumer', () => {
  let repository: {
    findOne: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  let logger: Logger

  beforeEach(() => {
    repository = {
      findOne: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(undefined),
    }
    logger = { debug: vi.fn(), warn: vi.fn(), log: vi.fn() } as unknown as Logger
  })

  const resolve = (
    headers: Parameters<typeof resolveApiKeyConsumer>[1],
    rawHeaders?: Record<string, unknown>,
  ) =>
    resolveApiKeyConsumer(
      repository as unknown as Repository<ApiKeyConsumer>,
      headers,
      logger,
      rawHeaders,
    )

  it('resolves on the credential identifier without touching the fallback', async () => {
    const binding = { id: 'binding-1', credentialIdentifier: 'cred-1' }
    repository.findOne.mockResolvedValueOnce(binding)

    const result = await resolve({ credentialIdentifier: 'cred-1' })

    expect(result).toBe(binding)
    expect(repository.findOne).toHaveBeenCalledTimes(1)
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { credentialIdentifier: 'cred-1' },
      relations: ['tenant'],
    })
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('falls back to the clientId for a self-issued key that has never been used', async () => {
    const binding = { id: 'binding-1', clientId: 'ENV123-APP456', credentialIdentifier: null }
    repository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(binding)

    const result = await resolve({
      credentialIdentifier: 'cred-1',
      consumerUsername: 'ENV123-APP456',
      consumerId: 'kong-consumer-uuid',
    })

    expect(result).toBe(binding)
    expect(repository.findOne).toHaveBeenLastCalledWith({
      where: { clientId: In(['ENV123-APP456']), credentialIdentifier: IsNull() },
      relations: ['tenant'],
    })
  })

  it('only accepts a clientId for a binding that has never been used', async () => {
    // clientId is displayed in the UI and on the Portal Consumers page, so it is a much
    // weaker secret than Kong's credential UUID. Once a binding is activated this path
    // must be closed for it.
    repository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null)

    await resolve({ consumerUsername: 'ENV123-APP456' })

    expect(repository.findOne).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ credentialIdentifier: IsNull() }),
      }),
    )
  })

  it('recovers a key whose stored credential identifier is stale', async () => {
    // Regenerating on the Portal mints a new Kong credential and tells Notify nothing,
    // so the stored identifier points at one that no longer exists. Before the tenant
    // arrived in a header this was unrecoverable: the credential lookup misses and the
    // unqualified clientId match refuses a binding that has already been used.
    const binding = {
      id: 'binding-1',
      clientId: 'ENV123-APP456',
      credentialIdentifier: 'stale-cred',
      tenant: { externalId: 'cstar-guid' },
    }
    repository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(binding)

    const result = await resolve({
      credentialIdentifier: 'rotated-cred',
      consumerUsername: 'ENV123-APP456',
      consumerGroups: ['cstar-guid', 'ENV123'],
    })

    expect(result).toBe(binding)
    expect(repository.findOne).toHaveBeenLastCalledWith({
      where: {
        clientId: In(['ENV123-APP456']),
        tenant: { externalId: In(['cstar-guid', 'ENV123']) },
      },
      relations: ['tenant'],
    })
    // The rotated identifier is recorded, so the next request takes the fast path.
    expect(binding.credentialIdentifier).toBe('rotated-cred')
  })

  it('falls back to the unqualified clientId when the gateway forwards no groups', async () => {
    // Consumers issued before ACL groups existed carry none, so there is no tenant to
    // narrow the match to and the never-used restriction still applies.
    const binding = { id: 'binding-1', clientId: 'ENV123-APP456', credentialIdentifier: null }
    repository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(binding)

    const result = await resolve({
      credentialIdentifier: 'cred-1',
      consumerUsername: 'ENV123-APP456',
      consumerGroups: [],
    })

    expect(result).toBe(binding)
    expect(repository.findOne).toHaveBeenLastCalledWith({
      where: { clientId: In(['ENV123-APP456']), credentialIdentifier: IsNull() },
      relations: ['tenant'],
    })
  })

  it('backfills the credential identifier so later requests take the fast path', async () => {
    const binding = { id: 'binding-1', clientId: 'ENV123-APP456', credentialIdentifier: null }
    repository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(binding)

    await resolve({
      credentialIdentifier: 'cred-1',
      consumerUsername: 'ENV123-APP456',
      consumerId: 'kong-consumer-uuid',
    })

    expect(repository.update).toHaveBeenCalledWith(
      { id: 'binding-1' },
      expect.objectContaining({
        credentialIdentifier: 'cred-1',
        consumerId: 'kong-consumer-uuid',
      }),
    )
    // The in-memory instance is updated too, so the caller sees the resolved identifier.
    expect(binding.credentialIdentifier).toBe('cred-1')
  })

  it('still authorizes the request when the backfill write fails', async () => {
    const binding = { id: 'binding-1', clientId: 'ENV123-APP456', credentialIdentifier: null }
    repository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(binding)
    repository.update.mockRejectedValue(new Error('unique constraint violated'))

    const result = await resolve({
      credentialIdentifier: 'cred-1',
      consumerUsername: 'ENV123-APP456',
    })

    expect(result).toBe(binding)
    expect(logger.warn).toHaveBeenCalled()
  })

  it('deduplicates the username and custom-id candidates', async () => {
    repository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'binding-1' })

    await resolve({ consumerUsername: 'ENV123-APP456', consumerCustomId: 'ENV123-APP456' })

    expect(repository.findOne).toHaveBeenLastCalledWith({
      where: { clientId: In(['ENV123-APP456']), credentialIdentifier: IsNull() },
      relations: ['tenant'],
    })
  })

  it('returns null when nothing matches', async () => {
    expect(
      await resolve({ credentialIdentifier: 'cred-1', consumerUsername: 'unknown' }),
    ).toBeNull()
  })

  it('skips the fallback query when there is no clientId to match on', async () => {
    const result = await resolve({ credentialIdentifier: 'cred-1' })

    expect(result).toBeNull()
    expect(repository.findOne).toHaveBeenCalledTimes(1)
  })
})
