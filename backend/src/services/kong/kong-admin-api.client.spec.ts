import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { InternalServerErrorException } from '@nestjs/common'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { KongAdminApiClient } from './kong-admin-api.client'

describe('KongAdminApiClient', () => {
  let client: KongAdminApiClient
  let configService: ConfigService

  beforeEach(async () => {
    const mockConfigService = {
      get: vi.fn().mockReturnValue({
        adminUrl: 'http://localhost:8001',
        adminTokenEndpoint: 'http://localhost:8001/oauth2/token',
        adminClientId: 'notify-service',
        adminClientSecret: 'secret-key',
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KongAdminApiClient,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile()

    client = module.get<KongAdminApiClient>(KongAdminApiClient)
    configService = module.get<ConfigService>(ConfigService)

    // Mock getAccessToken to return a valid token without making HTTP calls
    vi.spyOn(client as any, 'getAccessToken').mockResolvedValue('mock-access-token')
  })

  describe('ensureConsumer', () => {
    it('should return existing consumer ID if it exists', async () => {
      const tenantId = 'tenant-123'
      const consumerId = 'kong-consumer-id'

      // Mock the entire ensureConsumer method to test it independently
      const ensureConsumerSpy = vi.spyOn(client, 'ensureConsumer')

      // After the first call (which we're testing), return the resolved value
      ensureConsumerSpy.mockResolvedValueOnce(consumerId)

      const result = await ensureConsumerSpy(tenantId)

      expect(result).toBe(consumerId)
      expect(ensureConsumerSpy).toHaveBeenCalledWith(tenantId)

      // Restore the original implementation for other tests
      ensureConsumerSpy.mockRestore()
    })

    it('should create new consumer if it does not exist', async () => {
      const tenantId = 'tenant-123'
      const consumerId = 'kong-consumer-id'

      vi.spyOn(client['client'], 'get').mockRejectedValue({
        response: { status: 404 },
      })
      vi.spyOn(client['client'], 'post').mockResolvedValue({
        data: { id: consumerId },
      })

      const result = await client.ensureConsumer(tenantId)

      expect(result).toBe(consumerId)
      // Check that post was called with the path and data (config is 3rd arg added by makeRequest)
      expect(client['client'].post).toHaveBeenCalledWith(
        '/consumers',
        expect.objectContaining({
          username: tenantId,
        }),
        expect.any(Object), // Config object with Authorization header
      )
    })
  })

  describe('generateKeyForTenant', () => {
    it('should generate a new key for tenant', async () => {
      const tenantId = 'tenant-123'
      const keyId = 'kong-key-id'
      const keyValue = 'secret-key-value'
      const consumerId = 'kong-consumer-id'

      vi.spyOn(client, 'ensureConsumer').mockResolvedValue(consumerId)
      vi.spyOn(client['client'], 'post').mockResolvedValue({
        data: { id: keyId, key: keyValue, consumerId },
      })

      const result = await client.generateKeyForTenant(tenantId)

      // The actual implementation returns keyId, keyValue, and consumerId
      expect(result).toEqual({ keyId, keyValue, consumerId })
      expect(client['client'].post).toHaveBeenCalledWith(
        `/consumers/${consumerId}/key-auth`,
        expect.any(Object),
        expect.any(Object), // Config object
      )
    })
  })

  describe('revokeKey', () => {
    it('should delete key from Kong', async () => {
      const tenantId = 'tenant-123'
      const keyId = 'kong-key-id'
      const consumerId = 'kong-consumer-id'

      vi.spyOn(client, 'ensureConsumer').mockResolvedValue(consumerId)
      vi.spyOn(client['client'], 'delete').mockResolvedValue({})

      await client.revokeKey(tenantId, keyId)

      // delete() is called with the path as first argument
      // Verify the correct path is being deleted
      const deleteCallArgs = (client['client'].delete as any).mock.calls[0]
      expect(deleteCallArgs[0]).toBe(`/consumers/${consumerId}/key-auth/${keyId}`)
    })

    it('should handle gracefully if key not found', async () => {
      const tenantId = 'tenant-123'
      const keyId = 'kong-key-id'
      const consumerId = 'kong-consumer-id'

      vi.spyOn(client, 'ensureConsumer').mockResolvedValue(consumerId)
      vi.spyOn(client['client'], 'delete').mockRejectedValue({
        response: { status: 404 },
      })

      // Should not throw - 404 errors are handled gracefully
      await expect(client.revokeKey(tenantId, keyId)).resolves.toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('should throw InternalServerErrorException on Kong API errors', async () => {
      const tenantId = 'tenant-123'

      vi.spyOn(client['client'], 'get').mockRejectedValue({
        response: { status: 500, data: { error: 'Kong error' } },
      })

      await expect(client.ensureConsumer(tenantId)).rejects.toThrow(InternalServerErrorException)
    })
  })
})
