import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { vi, describe, it, beforeEach, expect } from 'vitest'
import { ApiKeyService } from './api-key.service'
import { ApiKey } from './entities/api-key.entity'
import { Tenant } from '../tenants/entities/tenant.entity'
import { KongAdminApiClient } from '../../../services/kong/kong-admin-api.client'

describe('ApiKeyService', () => {
  let service: ApiKeyService
  let apiKeyRepository: Repository<ApiKey>
  let tenantRepository: Repository<Tenant>
  let kongClient: KongAdminApiClient

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        {
          provide: getRepositoryToken(ApiKey),
          useValue: {
            create: vi.fn(),
            save: vi.fn(),
            findOne: vi.fn(),
            createQueryBuilder: vi.fn(),
            find: vi.fn(),
            update: vi.fn(),
          },
        },
        {
          provide: getRepositoryToken(Tenant),
          useValue: {
            findOne: vi.fn(),
          },
        },
        {
          provide: KongAdminApiClient,
          useValue: {
            generateKeyForTenant: vi.fn(),
            revokeKey: vi.fn(),
            listKeysForTenant: vi.fn(),
            getKeyDetails: vi.fn(),
          },
        },
      ],
    }).compile()

    service = module.get<ApiKeyService>(ApiKeyService)
    apiKeyRepository = module.get<Repository<ApiKey>>(getRepositoryToken(ApiKey))
    tenantRepository = module.get<Repository<Tenant>>(getRepositoryToken(Tenant))
    kongClient = module.get<KongAdminApiClient>(KongAdminApiClient)
  })

  describe('generateKey', () => {
    it('should generate a key in Kong and store metadata in DB', async () => {
      const tenantId = 'tenant-123'
      const keyValue = 'generated-key-value'
      const keyId = 'kong-key-id-123'

      const mockTenant = {
        id: 'db-tenant-id',
        externalId: tenantId,
        isActive: true,
      }

      const mockKey = {
        id: 'our-key-id',
        tenantId: mockTenant.id,
        kongConsumerId: tenantId,
        kongKeyId: keyId,
        displayName: 'Test Key',
        createdAt: new Date(),
      }

      vi.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenant as any)
      vi.spyOn(kongClient, 'generateKeyForTenant').mockResolvedValue({
        keyId,
        keyValue,
        consumerId: tenantId,
      })
      vi.spyOn(apiKeyRepository, 'create').mockReturnValue(mockKey as any)
      vi.spyOn(apiKeyRepository, 'save').mockResolvedValue(mockKey as any)

      const result = await service.generateKey(tenantId, { displayName: 'Test Key' }, 'user-123')

      expect(result.key).toBe(keyValue)
      expect(result.displayName).toBe('Test Key')
      expect(tenantRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { externalId: tenantId } }),
      )
      // Service calls generateKeyForTenant with internal tenant ID
      expect(kongClient.generateKeyForTenant).toHaveBeenCalledWith(mockTenant.id, undefined)
      expect(apiKeyRepository.save).toHaveBeenCalled()
    })
  })

  describe('revokeKey', () => {
    it('should revoke key in Kong and mark as revoked in DB', async () => {
      const tenantId = 'db-tenant-id'
      const tenantExternalId = 'tenant-123'
      const keyId = 'our-key-id'
      const kongKeyId = 'kong-key-id-123'

      const mockTenant = {
        id: tenantId,
        externalId: tenantExternalId,
      }

      const mockKey = {
        id: keyId,
        tenantId,
        kongKeyId,
        revokedAt: null,
        isActive: true,
      }

      vi.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenant as any)
      vi.spyOn(apiKeyRepository, 'findOne').mockResolvedValue(mockKey as any)
      vi.spyOn(kongClient, 'revokeKey').mockResolvedValue(undefined)
      vi.spyOn(apiKeyRepository, 'save').mockResolvedValue({
        ...mockKey,
        revokedAt: new Date(),
      } as any)

      await service.revokeKey(tenantExternalId, keyId, 'user-123')

      expect(tenantRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { externalId: tenantExternalId } }),
      )
      // Service calls revokeKey with internal tenant ID
      expect(kongClient.revokeKey).toHaveBeenCalledWith(tenantId, kongKeyId)
      expect(apiKeyRepository.save).toHaveBeenCalled()
    })
  })

  describe('recordKeyUsage', () => {
    it('should increment usage count and update last used timestamp', async () => {
      const kongKeyId = 'kong-key-id-123'

      vi.spyOn(apiKeyRepository, 'update').mockResolvedValue({ affected: 1 } as any)

      await service.recordKeyUsage(kongKeyId)

      expect(apiKeyRepository.update).toHaveBeenCalledWith(
        { kongKeyId },
        expect.objectContaining({
          lastUsedAt: expect.any(Date),
        }),
      )
    })
  })
})
