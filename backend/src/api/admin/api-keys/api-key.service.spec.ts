import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ApiKeyService } from './api-key.service'
import { ApiKey } from './entities/api-key.entity'
import { KongAdminApiClient } from '../../../services/kong/kong-admin-api.client'

describe('ApiKeyService', () => {
  let service: ApiKeyService
  let repository: Repository<ApiKey>
  let kongClient: KongAdminApiClient

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        {
          provide: getRepositoryToken(ApiKey),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
            find: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: KongAdminApiClient,
          useValue: {
            generateKeyForTenant: jest.fn(),
            revokeKey: jest.fn(),
            listKeysForTenant: jest.fn(),
            getKeyDetails: jest.fn(),
          },
        },
      ],
    }).compile()

    service = module.get<ApiKeyService>(ApiKeyService)
    repository = module.get<Repository<ApiKey>>(getRepositoryToken(ApiKey))
    kongClient = module.get<KongAdminApiClient>(KongAdminApiClient)
  })

  describe('generateKey', () => {
    it('should generate a key in Kong and store metadata in DB', async () => {
      const tenantId = 'tenant-123'
      const keyValue = 'generated-key-value'
      const keyId = 'kong-key-id-123'

      const mockKey = {
        id: 'our-key-id',
        tenantId,
        kongConsumerId: tenantId,
        kongKeyId: keyId,
        displayName: 'Test Key',
        createdAt: new Date(),
      }

      jest.spyOn(kongClient, 'generateKeyForTenant').mockResolvedValue({
        keyId,
        keyValue,
      })
      jest.spyOn(repository, 'create').mockReturnValue(mockKey as any)
      jest.spyOn(repository, 'save').mockResolvedValue(mockKey as any)

      const result = await service.generateKey(tenantId, { displayName: 'Test Key' }, 'user-123')

      expect(result.key).toBe(keyValue)
      expect(result.displayName).toBe('Test Key')
      expect(kongClient.generateKeyForTenant).toHaveBeenCalledWith(tenantId)
      expect(repository.save).toHaveBeenCalled()
    })
  })

  describe('revokeKey', () => {
    it('should revoke key in Kong and mark as revoked in DB', async () => {
      const tenantId = 'tenant-123'
      const keyId = 'our-key-id'
      const kongKeyId = 'kong-key-id-123'

      const mockKey = {
        id: keyId,
        tenantId,
        kongKeyId,
        revokedAt: null,
        isActive: true,
      }

      jest.spyOn(repository, 'findOne').mockResolvedValue(mockKey as any)
      jest.spyOn(kongClient, 'revokeKey').mockResolvedValue(undefined)
      jest.spyOn(repository, 'save').mockResolvedValue({ ...mockKey, revokedAt: new Date() } as any)

      await service.revokeKey(tenantId, keyId, 'user-123')

      expect(kongClient.revokeKey).toHaveBeenCalledWith(tenantId, kongKeyId)
      expect(repository.save).toHaveBeenCalled()
    })
  })

  describe('recordKeyUsage', () => {
    it('should increment usage count and update last used timestamp', async () => {
      const kongKeyId = 'kong-key-id-123'

      jest.spyOn(repository, 'update').mockResolvedValue({ affected: 1 } as any)

      await service.recordKeyUsage(kongKeyId)

      expect(repository.update).toHaveBeenCalledWith(
        { kongKeyId },
        expect.objectContaining({
          lastUsedAt: expect.any(Date),
        }),
      )
    })
  })
})
