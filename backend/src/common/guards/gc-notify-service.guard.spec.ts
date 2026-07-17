import { Test, TestingModule } from '@nestjs/testing'
import {
  ExecutionContext,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { GcNotifyServiceGuard } from './gc-notify-service.guard'
import { Tenant } from '../../api/admin/tenants/entities/tenant.entity'
import { ApiKeyConsumer } from '../../api/api-keys/entities/api-key-consumer.entity'

type MockRequest = {
  headers: Record<string, string>
  tenant?: Tenant
  tenantId?: string
  tenantExternalId?: string
  gcNotifyAuthHeader?: string
}

const VALID_AUTH_HEADER = 'ApiKey-v1 test-key-value'

function buildContext(request: MockRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext
}

describe('GcNotifyServiceGuard', () => {
  let guard: GcNotifyServiceGuard
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
        GcNotifyServiceGuard,
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

    guard = module.get<GcNotifyServiceGuard>(GcNotifyServiceGuard)
  })

  describe('Authorization header validation', () => {
    it('should reject request with missing Authorization header', async () => {
      const context = buildContext({ headers: { 'x-credential-identifier': 'cred-1' } })
      await expect(guard.canActivate(context)).rejects.toThrow(BadRequestException)
    })

    it('should reject request with wrong Authorization scheme', async () => {
      const context = buildContext({
        headers: { authorization: 'Bearer something', 'x-credential-identifier': 'cred-1' },
      })
      await expect(guard.canActivate(context)).rejects.toThrow(BadRequestException)
    })

    it('should reject request with empty key after ApiKey-v1 prefix', async () => {
      const context = buildContext({
        headers: { authorization: 'ApiKey-v1 ', 'x-credential-identifier': 'cred-1' },
      })
      await expect(guard.canActivate(context)).rejects.toThrow(BadRequestException)
    })

    it('should attach the validated Authorization header value to the request', async () => {
      const mockTenant = { id: 'tenant-1', name: 'Test Tenant', externalId: 'ext-1' }
      mockApiKeyConsumerRepository.findOne.mockResolvedValue({
        credentialIdentifier: 'cred-1',
        tenantId: 'tenant-1',
        tenant: mockTenant,
      })

      const request: MockRequest = {
        headers: { authorization: VALID_AUTH_HEADER, 'x-credential-identifier': 'cred-1' },
      }
      const context = buildContext(request)

      const result = await guard.canActivate(context)

      expect(result).toBe(true)
      expect(request.gcNotifyAuthHeader).toBe(VALID_AUTH_HEADER)
    })
  })

  describe('x-credential-identifier validation', () => {
    it('should reject request with missing x-credential-identifier header', async () => {
      const context = buildContext({ headers: { authorization: VALID_AUTH_HEADER } })
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    })

    it('should reject request when tenant mapping is not found', async () => {
      mockApiKeyConsumerRepository.findOne.mockResolvedValue(null)
      const context = buildContext({
        headers: { authorization: VALID_AUTH_HEADER, 'x-credential-identifier': 'missing' },
      })
      await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException)
    })

    it('should reject request when the credential lookup throws', async () => {
      mockApiKeyConsumerRepository.findOne.mockRejectedValue(new Error('db down'))
      const context = buildContext({
        headers: { authorization: VALID_AUTH_HEADER, 'x-credential-identifier': 'cred-err' },
      })
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    })

    it('should reject request when mapped tenant is missing or deleted', async () => {
      mockApiKeyConsumerRepository.findOne.mockResolvedValue({
        credentialIdentifier: 'cred-1',
        tenantId: 'tenant-1',
        tenant: { id: 'tenant-1', isDeleted: true },
      })
      const context = buildContext({
        headers: { authorization: VALID_AUTH_HEADER, 'x-credential-identifier': 'cred-1' },
      })
      await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException)
    })
  })

  describe('Tenant context attachment', () => {
    it('should attach tenant context to the request on success', async () => {
      const mockTenant = { id: 'tenant-1', name: 'Test Tenant', externalId: 'ext-123' }
      mockApiKeyConsumerRepository.findOne.mockResolvedValue({
        credentialIdentifier: 'cred-1',
        tenantId: 'tenant-1',
        tenant: mockTenant,
      })

      const request: MockRequest = {
        headers: { authorization: VALID_AUTH_HEADER, 'x-credential-identifier': 'cred-1' },
      }
      const context = buildContext(request)

      const result = await guard.canActivate(context)

      expect(result).toBe(true)
      expect(request.tenant).toEqual(mockTenant)
      expect(request.tenantId).toBe('tenant-1')
      expect(request.tenantExternalId).toBe('ext-123')
      expect(mockApiKeyConsumerRepository.findOne).toHaveBeenCalledWith({
        where: { credentialIdentifier: 'cred-1' },
        relations: ['tenant'],
      })
    })
  })
})
