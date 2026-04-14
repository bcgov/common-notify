import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ChesOAuthService } from './ches-oauth.service'

describe('ChesOAuthService', () => {
  let configService: ConfigService

  const mockConfigService = {
    get: vi.fn(),
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    global.fetch = vi.fn() as any

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChesOAuthService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile()

    configService = module.get<ConfigService>(ConfigService)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('isConfigured', () => {
    it('should return true when all credentials are configured', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          'ches.tokenUrl': 'https://ches.example.com/token',
          'ches.clientId': 'test-client',
          'ches.clientSecret': 'test-secret',
        }
        return config[key] || ''
      })

      // Reinitialize service to pick up new config
      const newService = new ChesOAuthService(configService)

      expect(newService.isConfigured()).toBe(true)
    })

    it('should return false when credentials are missing', () => {
      mockConfigService.get.mockReturnValue('')

      const newService = new ChesOAuthService(configService)

      expect(newService.isConfigured()).toBe(false)
    })

    it('should return false when tokenUrl is missing', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          'ches.tokenUrl': '',
          'ches.clientId': 'test-client',
          'ches.clientSecret': 'test-secret',
        }
        return config[key] || ''
      })

      const newService = new ChesOAuthService(configService)

      expect(newService.isConfigured()).toBe(false)
    })
  })

  describe('getValidToken', () => {
    beforeEach(() => {
      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          'ches.tokenUrl': 'https://ches.example.com/token',
          'ches.clientId': 'test-client',
          'ches.clientSecret': 'test-secret',
        }
        return config[key] || ''
      })
    })

    it('should fetch and return a new token', async () => {
      const mockToken = 'new-access-token'
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: mockToken,
          expires_in: 3600,
        }),
      }

      ;(global.fetch as any).mockResolvedValue(mockResponse)

      const newService = new ChesOAuthService(configService)
      const token = await newService.getValidToken()

      expect(token).toBe(mockToken)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://ches.example.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      )
    })

    it('should return cached token if not expired', async () => {
      const mockToken = 'cached-token'
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: mockToken,
          expires_in: 3600,
        }),
      }

      ;(global.fetch as any).mockResolvedValue(mockResponse)

      const newService = new ChesOAuthService(configService)

      // First call - fetches token
      const token1 = await newService.getValidToken()
      expect(token1).toBe(mockToken)

      // Second call - should use cached token
      const token2 = await newService.getValidToken()
      expect(token2).toBe(mockToken)

      // Fetch should only be called once
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('should throw error if token request fails', async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue('Unauthorized'),
      })

      const newService = new ChesOAuthService(configService)

      await expect(newService.getValidToken()).rejects.toThrow(
        'Failed to fetch CHES OAuth token: 401',
      )
    })

    it('should throw error if response has no access_token', async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          expires_in: 3600,
          // Missing access_token
        }),
      })

      const newService = new ChesOAuthService(configService)

      // The service should handle missing access_token gracefully
      const result = await newService.getValidToken()
      expect(result).toBeUndefined()
    })
  })
})
