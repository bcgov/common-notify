import { Test, TestingModule } from '@nestjs/testing'
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { SmsChannelFeatureFlagGuard } from './sms-channel-feature-flag.guard'
import { FeatureFlagService } from '../../api/feature-flag/feature-flag.service'

describe('SmsChannelFeatureFlagGuard', () => {
  let guard: SmsChannelFeatureFlagGuard
  let featureFlagService: FeatureFlagService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsChannelFeatureFlagGuard,
        {
          provide: FeatureFlagService,
          useValue: {
            isEnabled: vi.fn().mockResolvedValue(false),
            getFlagsForTenant: vi.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile()

    guard = module.get<SmsChannelFeatureFlagGuard>(SmsChannelFeatureFlagGuard)
    featureFlagService = module.get<FeatureFlagService>(FeatureFlagService)
  })

  describe('No SMS Channel (positive)', () => {
    it('should allow request without sms field in body', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: { email: 'test@example.com' },
            tenant: 'tenant-123',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(featureFlagService.isEnabled).not.toHaveBeenCalled()
    })

    it('should allow request with sms field set to null', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: { email: 'test@example.com', sms: null },
            tenant: 'tenant-123',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(featureFlagService.isEnabled).not.toHaveBeenCalled()
    })

    it('should allow request with sms field set to undefined', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: { email: 'test@example.com', sms: undefined },
            tenant: 'tenant-123',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(featureFlagService.isEnabled).not.toHaveBeenCalled()
    })

    it('should allow request with empty body', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: {},
            tenant: 'tenant-123',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(featureFlagService.isEnabled).not.toHaveBeenCalled()
    })

    it('should allow request with null body', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: null,
            tenant: 'tenant-123',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(featureFlagService.isEnabled).not.toHaveBeenCalled()
    })
  })

  describe('SMS Channel Requested (positive)', () => {
    it('should allow SMS request when SMS_NOTIFICATIONS flag is enabled', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: { sms: { phoneNumber: '+16045551234' } },
            tenant: 'tenant-123',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(true)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(featureFlagService.isEnabled).toHaveBeenCalledWith('SMS_NOTIFICATIONS', 'tenant-123')
    })

    it('should allow SMS request with minimal sms object', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: { sms: {} },
            tenant: 'tenant-456',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(true)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should allow SMS request with sms set to empty string (truthy check)', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: { sms: '' },
            tenant: 'tenant-789',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(featureFlagService.isEnabled).not.toHaveBeenCalled()
    })

    it('should allow SMS request with sms set to 0 (falsy check)', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: { sms: 0 },
            tenant: 'tenant-abc',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(featureFlagService.isEnabled).not.toHaveBeenCalled()
    })

    it('should allow SMS request with sms set to false (falsy check)', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: { sms: false },
            tenant: 'tenant-def',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(featureFlagService.isEnabled).not.toHaveBeenCalled()
    })
  })

  describe('SMS Channel Rejected (negative)', () => {
    it('should reject SMS request when SMS_NOTIFICATIONS flag is disabled', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: { sms: { phoneNumber: '+16045551234' } },
            tenant: 'tenant-123',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(false)

      expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException)
      expect(featureFlagService.isEnabled).toHaveBeenCalledWith('SMS_NOTIFICATIONS', 'tenant-123')
    })

    it('should reject SMS request with disabled flag error message', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: { sms: { phoneNumber: '+16045551234' } },
            tenant: 'tenant-456',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(false)

      expect(guard.canActivate(mockContext)).rejects.toThrow()
    })

    it('should reject SMS request when flag check throws error', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: { sms: { phoneNumber: '+16045551234' } },
            tenant: 'tenant-789',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(featureFlagService, 'isEnabled').mockRejectedValue(new Error('Service error'))

      expect(guard.canActivate(mockContext)).rejects.toThrow()
    })
  })

  describe('Tenant Context Validation', () => {
    it('should reject request when tenant is missing', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: { sms: { phoneNumber: '+16045551234' } },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow()
    })

    it('should reject request when tenant is null', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: { sms: { phoneNumber: '+16045551234' } },
            tenant: null,
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow()
    })

    it('should reject request when tenant is undefined', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: { sms: { phoneNumber: '+16045551234' } },
            tenant: undefined,
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow()
    })

    it('should use tenant ID from request context', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: { sms: { phoneNumber: '+16045551234' } },
            tenant: 'specific-tenant-id',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(true)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(featureFlagService.isEnabled).toHaveBeenCalledWith(
        'SMS_NOTIFICATIONS',
        'specific-tenant-id',
      )
    })
  })

  describe('Multi-channel Requests', () => {
    it('should allow multi-channel request without SMS', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: { email: 'test@example.com', push: { title: 'Test' } },
            tenant: 'tenant-123',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(featureFlagService.isEnabled).not.toHaveBeenCalled()
    })

    it('should validate SMS flag in multi-channel request with SMS', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: {
              email: 'test@example.com',
              sms: { phoneNumber: '+16045551234' },
              push: { title: 'Test' },
            },
            tenant: 'tenant-123',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(true)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(featureFlagService.isEnabled).toHaveBeenCalledWith('SMS_NOTIFICATIONS', 'tenant-123')
    })
  })

  describe('Edge Cases', () => {
    it('should handle request with complex SMS object', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: {
              sms: {
                phoneNumber: '+16045551234',
                content: 'Test message',
                metadata: { key: 'value' },
              },
            },
            tenant: 'tenant-123',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(true)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should handle request with sms as array (edge case)', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: {
              sms: [{ phoneNumber: '+16045551234' }],
            },
            tenant: 'tenant-123',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(true)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(featureFlagService.isEnabled).toHaveBeenCalledWith('SMS_NOTIFICATIONS', 'tenant-123')
    })

    it('should handle request with sms as string (edge case)', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: {
              sms: 'some-string-value',
            },
            tenant: 'tenant-123',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(true)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(featureFlagService.isEnabled).toHaveBeenCalledWith('SMS_NOTIFICATIONS', 'tenant-123')
    })

    it('should handle request with sms as number (edge case)', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: {
              sms: 123,
            },
            tenant: 'tenant-123',
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(true)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(featureFlagService.isEnabled).toHaveBeenCalledWith('SMS_NOTIFICATIONS', 'tenant-123')
    })
  })
})
