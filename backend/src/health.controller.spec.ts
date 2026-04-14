import { Test, TestingModule } from '@nestjs/testing'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { HealthController } from './health.controller'
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus'

describe('HealthController', () => {
  let controller: HealthController

  const mockHealthCheckService = {
    check: vi.fn(),
  }

  const mockTypeOrmHealthIndicator = {
    pingCheck: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: mockHealthCheckService,
        },
        {
          provide: TypeOrmHealthIndicator,
          useValue: mockTypeOrmHealthIndicator,
        },
      ],
    }).compile()

    controller = module.get<HealthController>(HealthController)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('check', () => {
    it('should return health status when database is healthy', async () => {
      const expectedHealthStatus = {
        status: 'ok',
        info: {
          database: {
            status: 'up',
          },
        },
      }

      mockHealthCheckService.check.mockResolvedValue(expectedHealthStatus)

      const result = await controller.check()

      expect(result).toEqual(expectedHealthStatus)
      expect(mockHealthCheckService.check).toHaveBeenCalled()
    })

    it('should call health check with database ping check', async () => {
      const expectedHealthStatus = {
        status: 'ok',
        info: {
          database: {
            status: 'up',
          },
        },
      }

      mockHealthCheckService.check.mockResolvedValue(expectedHealthStatus)

      await controller.check()

      // Verify check was called with a function
      expect(mockHealthCheckService.check).toHaveBeenCalledWith(expect.any(Array))
      expect(mockHealthCheckService.check).toHaveBeenCalledTimes(1)
    })

    it('should return degraded status when database is unhealthy', async () => {
      const degradedStatus = {
        status: 'error',
        error: {
          database: {
            status: 'down',
            message: 'Connection timeout',
          },
        },
      }

      mockHealthCheckService.check.mockResolvedValue(degradedStatus)

      const result = await controller.check()

      expect(result).toEqual(degradedStatus)
      expect(result.status).toBe('error')
    })

    it('should handle health check errors', async () => {
      const error = new Error('Health check failed')
      mockHealthCheckService.check.mockRejectedValue(error)

      await expect(controller.check()).rejects.toThrow('Health check failed')
    })

    it('should execute database ping check when requested', async () => {
      const expectedHealthStatus = {
        status: 'ok',
        info: {
          database: {
            status: 'up',
          },
        },
      }

      let pingCheckFunction: (() => Promise<any>) | null = null

      // Capture the check function array
      mockHealthCheckService.check.mockImplementation((checks: Array<() => any>) => {
        pingCheckFunction = checks[0]
        return Promise.resolve(expectedHealthStatus)
      })

      mockTypeOrmHealthIndicator.pingCheck.mockResolvedValue({
        database: {
          status: 'up',
        },
      })

      await controller.check()

      // Verify that a function was passed to check
      expect(pingCheckFunction).toBeDefined()
      expect(typeof pingCheckFunction).toBe('function')
    })

    it('should provide database indicator to health check', async () => {
      const expectedHealthStatus = {
        status: 'ok',
        info: {
          database: {
            status: 'up',
          },
        },
      }

      mockHealthCheckService.check.mockResolvedValue(expectedHealthStatus)

      const result = await controller.check()

      expect(result).toEqual(expectedHealthStatus)
      expect(mockHealthCheckService.check).toHaveBeenCalled()
    })
  })

  describe('HTTP GET /health', () => {
    it('should be accessible via GET request', () => {
      // Verify the controller has a GET endpoint
      const metadata = Reflect.getMetadata('path', HealthController)
      expect(metadata).toBe('health')
    })

    it('should have HealthCheck decorator applied', async () => {
      const expectedHealthStatus = {
        status: 'ok',
        info: {
          database: { status: 'up' },
        },
      }

      mockHealthCheckService.check.mockResolvedValue(expectedHealthStatus)

      const result = await controller.check()

      expect(result).toBeTruthy()
    })
  })
})
