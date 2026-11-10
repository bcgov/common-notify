import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import * as net from 'node:net'
import { ClamavService } from './clamav.service'

// Mock the net module
vi.mock('node:net', () => ({
  createConnection: vi.fn(),
}))

describe('ClamavService', () => {
  let service: ClamavService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClamavService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string, defaultValue?: any) => {
              const config = {
                CLAMAV_HOST: 'localhost',
                CLAMAV_PORT: '3310',
                CLAMAV_TIMEOUT: '5000',
                CLAMAV_ENABLED: 'false', // Disable ClamAV in tests
                CLAMAV_FAIL_CLOSED: 'false',
              }
              return config[key] || defaultValue
            }),
          },
        },
      ],
    }).compile()

    service = module.get<ClamavService>(ClamavService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('parseResponse', () => {
    it('should parse clean scan response', () => {
      const result = service['parseResponse']('stream: OK\n')
      expect(result.isInfected).toBe(false)
      expect(result.viruses).toEqual([])
    })

    it('should parse infected scan response', () => {
      const result = service['parseResponse']('stream: Win.Test.EICAR_HDB-1 FOUND\n')
      expect(result.isInfected).toBe(true)
      expect(result.viruses).toContain('Win.Test.EICAR_HDB-1')
      expect(result.quarantineInfo).toBeDefined()
      expect(result.quarantineInfo?.viruses).toContain('Win.Test.EICAR_HDB-1')
      expect(result.quarantineInfo?.scannedAt).toBeInstanceOf(Date)
    })

    it('should parse multiple infected response', () => {
      const response = 'stream: Virus.A FOUND\nstream: Virus.B FOUND\nstream: OK\n'
      const result = service['parseResponse'](response)
      expect(result.isInfected).toBe(true)
      expect(result.viruses).toHaveLength(2)
      expect(result.viruses).toContain('Virus.A')
      expect(result.viruses).toContain('Virus.B')
      expect(result.quarantineInfo).toBeDefined()
      expect(result.quarantineInfo?.viruses).toHaveLength(2)
    })

    it('should include scan timestamp', () => {
      const beforeScan = new Date()
      const result = service['parseResponse']('stream: OK\n')
      const afterScan = new Date()

      expect(result.scannedAt.getTime()).toBeGreaterThanOrEqual(beforeScan.getTime())
      expect(result.scannedAt.getTime()).toBeLessThanOrEqual(afterScan.getTime())
    })

    it('should include filename in quarantine details', () => {
      const result = service['parseResponse']('stream: Virus.A FOUND\n', 'malicious.pdf')
      expect(result.quarantineInfo).toBeDefined()
      expect(result.quarantineInfo?.filename).toBe('malicious.pdf')
      expect(result.quarantineInfo?.viruses).toContain('Virus.A')
    })

    it('should not include quarantine info for clean scans', () => {
      const result = service['parseResponse']('stream: OK\n', 'clean.pdf')
      expect(result.isInfected).toBe(false)
      expect(result.quarantineInfo).toBeUndefined()
    })
  })

  describe('getStatus', () => {
    it('should return service status', () => {
      const status = service.getStatus()
      expect(status).toHaveProperty('enabled')
      expect(status).toHaveProperty('failClosed')
      expect(status).toHaveProperty('healthy')
      expect(status).toHaveProperty('host')
      expect(status).toHaveProperty('port')
    })
  })

  describe('fail-closed mode', () => {
    it('should throw when ClamAV is disabled and fail-closed mode is enabled', async () => {
      const strictModule: TestingModule = await Test.createTestingModule({
        providers: [
          ClamavService,
          {
            provide: ConfigService,
            useValue: {
              get: vi.fn((key: string, defaultValue?: any) => {
                const config = {
                  CLAMAV_HOST: 'localhost',
                  CLAMAV_PORT: '3310',
                  CLAMAV_TIMEOUT: '5000',
                  CLAMAV_ENABLED: 'false',
                  CLAMAV_FAIL_CLOSED: 'true',
                }
                return config[key] || defaultValue
              }),
            },
          },
        ],
      }).compile()

      const strictService = strictModule.get<ClamavService>(ClamavService)

      await expect(strictService.scanBuffer(Buffer.from('x'), 'test.txt')).rejects.toThrow(
        'ClamAV scanning is disabled while fail-closed mode is enabled',
      )
    })

    it('should skip unavailable ClamAV when fail-closed mode is disabled', async () => {
      const strictModule: TestingModule = await Test.createTestingModule({
        providers: [
          ClamavService,
          {
            provide: ConfigService,
            useValue: {
              get: vi.fn((key: string, defaultValue?: any) => {
                const config = {
                  CLAMAV_HOST: 'localhost',
                  CLAMAV_PORT: '3310',
                  CLAMAV_TIMEOUT: '5000',
                  CLAMAV_ENABLED: 'false',
                  CLAMAV_FAIL_CLOSED: 'false',
                }
                return config[key] || defaultValue
              }),
            },
          },
        ],
      }).compile()

      const strictService = strictModule.get<ClamavService>(ClamavService)

      await expect(strictService.scanBuffer(Buffer.from('x'), 'test.txt')).resolves.toMatchObject({
        isInfected: false,
        viruses: [],
      })
    })
  })

  describe('recovery after ClamAV was unavailable', () => {
    type Outcome = 'ok' | 'error'

    /** A clamd socket that answers PING with PONG and a scan with OK, or fails to connect. */
    function fakeSocket(outcome: Outcome, onConnect: () => void) {
      const socket = Object.assign(new EventEmitter(), {
        destroy: vi.fn(),
        write: vi.fn(() => setImmediate(() => socket.emit('data', Buffer.from('PONG')))),
        end: vi.fn(() =>
          setImmediate(() => {
            socket.emit('data', Buffer.from('stream: OK\n'))
            socket.emit('end')
          }),
        ),
      })
      setImmediate(() =>
        outcome === 'ok' ? onConnect() : socket.emit('error', new Error('ECONNREFUSED')),
      )
      return socket
    }

    /** Each connection takes the next outcome; the last one repeats. */
    function connectionsWill(...outcomes: Outcome[]) {
      const connect = (_opts: unknown, cb: () => void) =>
        fakeSocket(outcomes.length > 1 ? outcomes.shift()! : outcomes[0], cb)
      vi.mocked(net.createConnection).mockImplementation(
        connect as unknown as typeof net.createConnection,
      )
    }

    async function buildService(failClosed: boolean): Promise<ClamavService> {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ClamavService,
          {
            provide: ConfigService,
            useValue: {
              get: vi.fn(
                (key: string) =>
                  ({
                    CLAMAV_HOST: 'localhost',
                    CLAMAV_PORT: '3310',
                    CLAMAV_TIMEOUT: '5000',
                    CLAMAV_ENABLED: 'true',
                    CLAMAV_FAIL_CLOSED: String(failClosed),
                  })[key],
              ),
            },
          },
        ],
      }).compile()
      return module.get<ClamavService>(ClamavService)
    }

    beforeEach(() => {
      vi.mocked(net.createConnection).mockReset()
    })

    it('scans once ClamAV comes up after the startup check failed', async () => {
      const svc = await buildService(true)
      connectionsWill('error')
      await svc.onModuleInit()
      expect(svc.getStatus().healthy).toBe(false)

      connectionsWill('ok')
      await expect(svc.scanBuffer(Buffer.from('x'), 'a.txt')).resolves.toMatchObject({
        isInfected: false,
      })
      expect(svc.getStatus().healthy).toBe(true)
    })

    it('scans again after one dropped scan connection', async () => {
      const svc = await buildService(true)
      connectionsWill('ok')
      await svc.onModuleInit()

      connectionsWill('error')
      await expect(svc.scanBuffer(Buffer.from('x'), 'a.txt')).rejects.toThrow('ECONNREFUSED')
      expect(svc.getStatus().healthy).toBe(false)

      connectionsWill('ok')
      await expect(svc.scanBuffer(Buffer.from('x'), 'a.txt')).resolves.toMatchObject({
        isInfected: false,
      })
    })

    it('still throws in fail-closed mode while ClamAV stays down', async () => {
      const svc = await buildService(true)
      connectionsWill('error')
      await svc.onModuleInit()

      await expect(svc.scanBuffer(Buffer.from('x'), 'a.txt')).rejects.toThrow(
        'ClamAV is unavailable while fail-closed mode is enabled',
      )
    })

    it('still skips the scan in fail-open mode while ClamAV stays down', async () => {
      const svc = await buildService(false)
      connectionsWill('error')
      await svc.onModuleInit()

      await expect(svc.scanBuffer(Buffer.from('x'), 'a.txt')).resolves.toMatchObject({
        isInfected: false,
        viruses: [],
      })
      expect(svc.getStatus().healthy).toBe(false)
    })
  })

  describe('Integration Tests (requires ClamAV running)', () => {
    it('should scan clean content', async () => {
      const status = service.getStatus()
      if (!status.healthy) {
        console.log('ClamAV not healthy, skipping integration test')
        return
      }

      const cleanBuffer = Buffer.from('This is clean content with no malware')
      const result = await service.scanBuffer(cleanBuffer, 'clean.txt')

      expect(result.isInfected).toBe(false)
      expect(result.viruses).toEqual([])
      expect(result.scannedAt).toBeInstanceOf(Date)
    })

    it('should detect EICAR test file', async () => {
      const status = service.getStatus()
      if (!status.healthy) {
        console.log('ClamAV not healthy, skipping integration test')
        return
      }

      // EICAR-STANDARD-ANTIVIRUS-TEST-FILE - detects as malware in all AV solutions
      const eicarBuffer = Buffer.from(
        'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
      )

      const result = await service.scanBuffer(eicarBuffer, 'eicar.txt')

      expect(result.isInfected).toBe(true)
      expect(result.viruses.length).toBeGreaterThan(0)
      expect(result.scannedAt).toBeInstanceOf(Date)
    })

    it('should include virus name in detection', async () => {
      const status = service.getStatus()
      if (!status.healthy) {
        console.log('ClamAV not healthy, skipping integration test')
        return
      }

      const eicarBuffer = Buffer.from(
        'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
      )

      const result = await service.scanBuffer(eicarBuffer, 'eicar.txt')

      expect(result.viruses).toContain(expect.stringContaining('EICAR'))
    })
  })
})
