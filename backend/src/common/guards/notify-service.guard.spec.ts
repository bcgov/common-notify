import { Test, TestingModule } from '@nestjs/testing'
import { ExecutionContext, UnauthorizedException, NotFoundException } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { IsNull } from 'typeorm'
import { NotifyServiceGuard } from './notify-service.guard'
import { ApiKey } from '../../api/admin/api-keys/entities/api-key.entity'
import { Tenant } from '../../api/admin/tenants/entities/tenant.entity'

describe('NotifyServiceGuard', () => {
  let guard: NotifyServiceGuard
  let mockApiKeyRepository: any
  let mockTenantRepository: any

  beforeEach(async () => {
    mockApiKeyRepository = {
      findOne: vi.fn(),
      update: vi.fn(),
    }

    mockTenantRepository = {
      findOne: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotifyServiceGuard,
        {
          provide: getRepositoryToken(ApiKey),
          useValue: mockApiKeyRepository,
        },
        {
          provide: getRepositoryToken(Tenant),
          useValue: mockTenantRepository,
        },
      ],
    }).compile()

    guard = module.get<NotifyServiceGuard>(NotifyServiceGuard)
  })

  describe('X-Consumer-ID Header Validation', () => {
    it('should reject request with missing X-Consumer-ID header', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {},
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })

    it('should reject request with empty X-Consumer-ID header', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-consumer-id': '',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })

    it('should extract X-Consumer-ID header and use it to look up API key', async () => {
      const mockTenant = { id: 'tenant-1', name: 'Test Tenant' }
      const mockApiKey = {
        id: 'key-1',
        kongConsumerId: 'kong-consumer-uuid-123',
        kongKeyId: 'kong-key-123',
        tenantId: 'tenant-1',
        displayName: 'Prod Key',
        revokedAt: null,
        usageCount: 5,
        lastUsedAt: new Date(),
        tenant: mockTenant,
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-consumer-id': 'kong-consumer-uuid-123',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      mockApiKeyRepository.findOne.mockResolvedValue(mockApiKey)
      mockApiKeyRepository.update.mockResolvedValue({ affected: 1 })

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(mockApiKeyRepository.findOne).toHaveBeenCalledWith({
        where: { kongConsumerId: 'kong-consumer-uuid-123', revokedAt: IsNull() },
        relations: ['tenant'],
      })
    })
  })

  describe('API Key Lookup', () => {
    it('should successfully authenticate request with valid API key', async () => {
      const mockTenant = { id: 'tenant-1', name: 'Production Tenant' }
      const mockApiKey = {
        id: 'key-1',
        kongConsumerId: 'kong-uuid-456',
        kongKeyId: 'kong-key-456',
        tenantId: 'tenant-1',
        displayName: 'Integration Key',
        revokedAt: null,
        usageCount: 10,
        lastUsedAt: new Date('2024-01-01'),
        tenant: mockTenant,
      }

      const mockRequest = {
        headers: {
          'x-consumer-id': 'kong-uuid-456',
        },
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest, // Return same object each time
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      mockApiKeyRepository.findOne.mockResolvedValue(mockApiKey)
      mockApiKeyRepository.update.mockResolvedValue({ affected: 1 })

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(mockRequest.tenant).toEqual(mockTenant)
      expect(mockRequest.tenantId).toBe('tenant-1')
      expect(mockRequest.apiKey).toEqual(mockApiKey)
    })

    it('should reject request when API key not found', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-consumer-id': 'non-existent-consumer-id',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      mockApiKeyRepository.findOne.mockResolvedValue(null)

      await expect(guard.canActivate(mockContext)).rejects.toThrow(NotFoundException)
    })

    it('should reject request when API key lookup fails with database error', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-consumer-id': 'kong-consumer-id',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      mockApiKeyRepository.findOne.mockRejectedValue(new Error('Database connection failed'))

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('Revocation Check', () => {
    it('should reject revoked API keys', async () => {
      const mockTenant = { id: 'tenant-1', name: 'Test Tenant' }
      const mockApiKey = {
        id: 'key-1',
        kongConsumerId: 'kong-uuid-789',
        kongKeyId: 'kong-key-789',
        tenantId: 'tenant-1',
        displayName: 'Revoked Key',
        revokedAt: new Date('2024-01-01'),
        usageCount: 5,
        tenant: mockTenant,
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-consumer-id': 'kong-uuid-789',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      mockApiKeyRepository.findOne.mockResolvedValue(mockApiKey)

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
      expect(mockApiKeyRepository.update).not.toHaveBeenCalled()
    })

    it('should accept active API keys (revokedAt is null)', async () => {
      const mockTenant = { id: 'tenant-1', name: 'Test Tenant' }
      const mockApiKey = {
        id: 'key-1',
        kongConsumerId: 'kong-uuid-101',
        kongKeyId: 'kong-key-101',
        tenantId: 'tenant-1',
        displayName: 'Active Key',
        revokedAt: null,
        usageCount: 5,
        lastUsedAt: new Date(),
        tenant: mockTenant,
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-consumer-id': 'kong-uuid-101',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      mockApiKeyRepository.findOne.mockResolvedValue(mockApiKey)
      mockApiKeyRepository.update.mockResolvedValue({ affected: 1 })

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })

  describe('Tenant Validation', () => {
    it('should reject request when tenant is missing from API key', async () => {
      const mockApiKey = {
        id: 'key-1',
        kongConsumerId: 'kong-uuid-202',
        kongKeyId: 'kong-key-202',
        tenantId: 'tenant-1',
        displayName: 'Orphaned Key',
        revokedAt: null,
        usageCount: 5,
        tenant: null,
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-consumer-id': 'kong-uuid-202',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      mockApiKeyRepository.findOne.mockResolvedValue(mockApiKey)

      await expect(guard.canActivate(mockContext)).rejects.toThrow(NotFoundException)
    })

    it('should attach tenant context to request', async () => {
      const mockTenant = { id: 'tenant-1', name: 'Test Tenant', externalId: 'ext-123' }
      const mockApiKey = {
        id: 'key-1',
        kongConsumerId: 'kong-uuid-303',
        kongKeyId: 'kong-key-303',
        tenantId: 'tenant-1',
        displayName: 'Context Key',
        revokedAt: null,
        usageCount: 5,
        lastUsedAt: new Date(),
        tenant: mockTenant,
      }

      // Create a request object that will be reused in mock calls
      const mockRequest = {
        headers: {
          'x-consumer-id': 'kong-uuid-303',
        },
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest, // Return same object each time
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      mockApiKeyRepository.findOne.mockResolvedValue(mockApiKey)
      mockApiKeyRepository.update.mockResolvedValue({ affected: 1 })

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(mockRequest.tenant).toEqual(mockTenant)
      expect(mockRequest.tenantId).toBe('tenant-1')
      expect(mockRequest.apiKey).toEqual(mockApiKey)
    })
  })

  describe('Usage Tracking', () => {
    it('should increment usage count on successful authentication', async () => {
      const mockTenant = { id: 'tenant-1', name: 'Test Tenant' }
      const mockApiKey = {
        id: 'key-1',
        kongConsumerId: 'kong-uuid-404',
        kongKeyId: 'kong-key-404',
        tenantId: 'tenant-1',
        displayName: 'Tracked Key',
        revokedAt: null,
        usageCount: 5,
        lastUsedAt: new Date('2024-01-01'),
        tenant: mockTenant,
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-consumer-id': 'kong-uuid-404',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      mockApiKeyRepository.findOne.mockResolvedValue(mockApiKey)
      mockApiKeyRepository.update.mockResolvedValue({ affected: 1 })

      await guard.canActivate(mockContext)

      expect(mockApiKeyRepository.update).toHaveBeenCalledWith('key-1', {
        usageCount: 6,
        lastUsedAt: expect.any(Date),
      })
    })

    it('should not fail request if usage update fails', async () => {
      const mockTenant = { id: 'tenant-1', name: 'Test Tenant' }
      const mockApiKey = {
        id: 'key-1',
        kongConsumerId: 'kong-uuid-505',
        kongKeyId: 'kong-key-505',
        tenantId: 'tenant-1',
        displayName: 'Test Key',
        revokedAt: null,
        usageCount: 5,
        lastUsedAt: new Date(),
        tenant: mockTenant,
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-consumer-id': 'kong-uuid-505',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      mockApiKeyRepository.findOne.mockResolvedValue(mockApiKey)
      mockApiKeyRepository.update.mockRejectedValue(new Error('Update failed'))

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })
})
