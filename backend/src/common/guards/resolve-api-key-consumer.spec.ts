import { Logger } from '@nestjs/common'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { In, Repository } from 'typeorm'
import { ApiKeyConsumer } from '../../api/api-keys/entities/api-key-consumer.entity'
import {
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
    })
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
    logger = { debug: vi.fn(), warn: vi.fn() } as unknown as Logger
  })

  const resolve = (headers: Parameters<typeof resolveApiKeyConsumer>[1]) =>
    resolveApiKeyConsumer(repository as unknown as Repository<ApiKeyConsumer>, headers, logger)

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
      where: { clientId: In(['ENV123-APP456']) },
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
      where: { clientId: In(['ENV123-APP456']) },
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
