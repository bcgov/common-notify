import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { InternalServerErrorException } from '@nestjs/common'
import { KongAdminApiClient } from './kong-admin-api.client'

describe('KongAdminApiClient', () => {
  let client: KongAdminApiClient
  let configService: ConfigService

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn().mockReturnValue({
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
  })

  describe('ensureConsumer', () => {
    it('should return existing consumer ID if it exists', async () => {
      const tenantId = 'tenant-123'
      const consumerId = 'kong-consumer-id'

      // Mock axios get to return existing consumer
      jest.spyOn(client['client'], 'get').mockResolvedValue({
        data: { id: consumerId },
      })

      const result = await client.ensureConsumer(tenantId)

      expect(result).toBe(consumerId)
      expect(client['client'].get).toHaveBeenCalledWith(`/consumers/${tenantId}`)
    })

    it('should create new consumer if it does not exist', async () => {
      const tenantId = 'tenant-123'
      const consumerId = 'kong-consumer-id'

      jest.spyOn(client['client'], 'get').mockRejectedValue({
        response: { status: 404 },
      })
      jest.spyOn(client['client'], 'post').mockResolvedValue({
        data: { id: consumerId },
      })

      const result = await client.ensureConsumer(tenantId)

      expect(result).toBe(consumerId)
      expect(client['client'].post).toHaveBeenCalledWith(
        '/consumers',
        expect.objectContaining({
          username: tenantId,
        }),
      )
    })
  })

  describe('generateKeyForTenant', () => {
    it('should generate a new key for tenant', async () => {
      const tenantId = 'tenant-123'
      const keyId = 'kong-key-id'
      const keyValue = 'secret-key-value'
      const consumerId = 'kong-consumer-id'

      jest.spyOn(client, 'ensureConsumer').mockResolvedValue(consumerId)
      jest.spyOn(client['client'], 'post').mockResolvedValue({
        data: { id: keyId, key: keyValue },
      })

      const result = await client.generateKeyForTenant(tenantId)

      expect(result).toEqual({ keyId, keyValue })
      expect(client['client'].post).toHaveBeenCalledWith(
        `/consumers/${consumerId}/key-auth`,
        expect.any(Object),
      )
    })
  })

  describe('revokeKey', () => {
    it('should delete key from Kong', async () => {
      const tenantId = 'tenant-123'
      const keyId = 'kong-key-id'
      const consumerId = 'kong-consumer-id'

      jest.spyOn(client, 'ensureConsumer').mockResolvedValue(consumerId)
      jest.spyOn(client['client'], 'delete').mockResolvedValue({})

      await client.revokeKey(tenantId, keyId)

      expect(client['client'].delete).toHaveBeenCalledWith(
        `/consumers/${consumerId}/key-auth/${keyId}`,
      )
    })

    it('should handle gracefully if key not found', async () => {
      const tenantId = 'tenant-123'
      const keyId = 'kong-key-id'
      const consumerId = 'kong-consumer-id'

      jest.spyOn(client, 'ensureConsumer').mockResolvedValue(consumerId)
      jest.spyOn(client['client'], 'delete').mockRejectedValue({
        response: { status: 404 },
      })

      // Should not throw
      await expect(client.revokeKey(tenantId, keyId)).resolves.toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('should throw InternalServerErrorException on Kong API errors', async () => {
      const tenantId = 'tenant-123'

      jest.spyOn(client['client'], 'get').mockRejectedValue({
        response: { status: 500, data: { error: 'Kong error' } },
      })

      await expect(client.ensureConsumer(tenantId)).rejects.toThrow(InternalServerErrorException)
    })
  })
})
