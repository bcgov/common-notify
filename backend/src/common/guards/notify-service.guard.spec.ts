import { Test, TestingModule } from '@nestjs/testing'
import { ExecutionContext, UnauthorizedException, NotFoundException } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NotifyServiceGuard } from './notify-service.guard'
import { Tenant } from '../../api/admin/tenants/entities/tenant.entity'
import { ApiKeyConsumer } from '../../api/api-keys/entities/api-key-consumer.entity'

type MockRequest = {
  headers: Record<string, string>
  tenant?: Tenant
  tenantId?: string
  tenantExternalId?: string
}

describe('NotifyServiceGuard', () => {
  let guard: NotifyServiceGuard
  let mockTenantRepository: any
  let mockApiKeyConsumerRepository: any

  beforeEach(async () => {
    mockTenantRepository = {
      findOne: vi.fn(),
    }
    mockApiKeyConsumerRepository = {
      findOne: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotifyServiceGuard,
        {
          provide: getRepositoryToken(Tenant),
          useValue: mockTenantRepository,
        },
        {
          provide: getRepositoryToken(ApiKeyConsumer),
          useValue: mockApiKeyConsumerRepository,
        },
      ],
    }).compile()

    guard = module.get<NotifyServiceGuard>(NotifyServiceGuard)
  })

  describe('x-credential-identifier Header Validation', () => {
    it('should reject request with missing x-credential-identifier header', async () => {
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

    it('should reject request with empty x-credential-identifier header', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-credential-identifier': '',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })

    it('should extract x-credential-identifier header and use it to look up api key mapping', async () => {
      const mockTenant = { id: 'tenant-1', name: 'Test Tenant', externalId: 'ext-tenant-123' }
      const mockMapping = {
        credentialIdentifier: 'cred-123',
        tenantId: 'tenant-1',
        tenant: mockTenant,
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-credential-identifier': 'cred-123',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      mockApiKeyConsumerRepository.findOne.mockResolvedValue(mockMapping)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(mockApiKeyConsumerRepository.findOne).toHaveBeenCalledWith({
        where: { credentialIdentifier: 'cred-123' },
        relations: ['tenant'],
      })
    })
  })

  describe('Tenant Lookup', () => {
    it('should successfully authenticate request with valid tenant mapping', async () => {
      const mockTenant = { id: 'tenant-1', name: 'Production Tenant', externalId: 'ext-tenant-456' }
      const mockMapping = {
        credentialIdentifier: 'cred-456',
        tenantId: 'tenant-1',
        tenant: mockTenant,
      }

      const mockRequest: MockRequest = {
        headers: {
          'x-credential-identifier': 'cred-456',
        },
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest, // Return same object each time
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      mockApiKeyConsumerRepository.findOne.mockResolvedValue(mockMapping)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(mockRequest.tenant).toEqual(mockTenant)
      expect(mockRequest.tenantId).toBe('tenant-1')
      expect(mockRequest.tenantExternalId).toBe('ext-tenant-456')
    })

    it('should reject request when tenant mapping is not found', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-credential-identifier': 'missing-credential',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      mockApiKeyConsumerRepository.findOne.mockResolvedValue(null)

      await expect(guard.canActivate(mockContext)).rejects.toThrow(NotFoundException)
    })

    it('should reject request when tenant lookup fails with database error', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-credential-identifier': 'cred-db-error',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      mockApiKeyConsumerRepository.findOne.mockRejectedValue(
        new Error('Database connection failed'),
      )

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })

    it('should reject request when mapping tenant is missing/deleted', async () => {
      const mockMapping = {
        credentialIdentifier: 'cred-tenant-missing',
        tenantId: 'tenant-missing',
        tenant: null,
      }
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-credential-identifier': 'cred-tenant-missing',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      mockApiKeyConsumerRepository.findOne.mockResolvedValue(mockMapping)

      await expect(guard.canActivate(mockContext)).rejects.toThrow(NotFoundException)
    })
  })

  describe('Request Context', () => {
    it('should attach tenant context to request', async () => {
      const mockTenant = { id: 'tenant-1', name: 'Test Tenant', externalId: 'ext-123' }
      const mockMapping = {
        credentialIdentifier: 'cred-attach',
        tenantId: 'tenant-1',
        tenant: mockTenant,
      }

      const mockRequest: MockRequest = {
        headers: {
          'x-credential-identifier': 'cred-attach',
        },
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      mockApiKeyConsumerRepository.findOne.mockResolvedValue(mockMapping)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(mockRequest.tenant).toEqual(mockTenant)
      expect(mockRequest.tenantId).toBe('tenant-1')
      expect(mockRequest.tenantExternalId).toBe('ext-123')
    })
  })
})
