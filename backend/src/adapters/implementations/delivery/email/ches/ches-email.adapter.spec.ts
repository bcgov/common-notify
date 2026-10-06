import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  UnauthorizedException,
} from '@nestjs/common'
import { ChesEmailTransport } from '../../../../../../src/adapters/implementations/delivery/email/ches/ches-email.adapter'
import type { SendEmailOptions, SendEmailResult } from '../../../../../../src/adapters/interfaces'
import { RedisConcurrencyLimiter } from '../../../../../../src/common/redis/concurrency-limiter'
import { RedisCircuitBreaker } from '../../../../../../src/common/redis/circuit-breaker'
import { TransientDeliveryError } from '../../../../../../src/adapters/delivery-errors'
import { createRedisClient } from '../../../../../../src/queue/redis-connection'

vi.mock('../../../../../../src/queue/redis-connection', () => ({
  createRedisClient: vi.fn(() => ({ quit: vi.fn().mockResolvedValue('OK') })),
}))

const fetchMock = vi.fn()
global.fetch = fetchMock

describe('ChesEmailTransport', () => {
  let transport: ChesEmailTransport
  let configGetMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    fetchMock.mockReset()
    configGetMock = vi.fn()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChesEmailTransport,
        {
          provide: ConfigService,
          useValue: { get: configGetMock },
        },
      ],
    }).compile()

    transport = module.get(ChesEmailTransport)
  })

  describe('name property', () => {
    it('exposes name as ches', () => {
      expect(transport.name).toBe('ches')
    })
  })

  describe('configuration validation', () => {
    it('throws when CHES config is incomplete', async () => {
      configGetMock.mockReturnValue(undefined)

      await expect(
        transport.send({
          to: 'user@example.com',
          subject: 'Test',
          body: '<p>Hello</p>',
        }),
      ).rejects.toThrow('CHES configuration incomplete')
    })

    it('throws when baseUrl is missing', async () => {
      configGetMock.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          'ches.clientId': 'client-id',
          'ches.clientSecret': 'client-secret',
          'ches.tokenUrl': 'https://auth.example.com/token',
        }
        return map[key]
      })

      await expect(
        transport.send({
          to: 'user@example.com',
          subject: 'Test',
          body: 'Body',
        }),
      ).rejects.toThrow()
    })

    it('throws when clientId is missing', async () => {
      configGetMock.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          'ches.baseUrl': 'https://ches.example.com/api/v1',
          'ches.clientSecret': 'client-secret',
          'ches.tokenUrl': 'https://auth.example.com/token',
        }
        return map[key]
      })

      await expect(
        transport.send({
          to: 'user@example.com',
          subject: 'Test',
          body: 'Body',
        }),
      ).rejects.toThrow()
    })

    it('throws when clientSecret is missing', async () => {
      configGetMock.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          'ches.baseUrl': 'https://ches.example.com/api/v1',
          'ches.clientId': 'client-id',
          'ches.tokenUrl': 'https://auth.example.com/token',
        }
        return map[key]
      })

      await expect(
        transport.send({
          to: 'user@example.com',
          subject: 'Test',
          body: 'Body',
        }),
      ).rejects.toThrow()
    })

    it('throws when tokenUrl is missing', async () => {
      configGetMock.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          'ches.baseUrl': 'https://ches.example.com/api/v1',
          'ches.clientId': 'client-id',
          'ches.clientSecret': 'client-secret',
        }
        return map[key]
      })

      await expect(
        transport.send({
          to: 'user@example.com',
          subject: 'Test',
          body: 'Body',
        }),
      ).rejects.toThrow()
    })
  })

  describe('send', () => {
    const mockConfig = () => {
      configGetMock.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          'ches.baseUrl': 'https://ches.example.com/api/v1',
          'ches.clientId': 'client-id',
          'ches.clientSecret': 'client-secret',
          'ches.tokenUrl': 'https://auth.example.com/token',
          'ches.from': 'noreply@example.com',
        }
        return map[key]
      })
    }

    it('returns SendEmailResult when send succeeds', async () => {
      mockConfig()

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'token-123',
              expires_in: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [{ msgId: 'msg-456', to: ['user@example.com'] }],
              txId: 'tx-789',
            }),
        })

      const options: SendEmailOptions = {
        to: 'user@example.com',
        subject: 'Test',
        body: '<p>Hello</p>',
      }

      const result: SendEmailResult = await transport.send(options)

      expect(result.messageId).toBe('msg-456')
      expect(result.providerResponse).toBe('tx-789')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('sends email with correct headers and authorization', async () => {
      mockConfig()

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'token-123',
              expires_in: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [{ msgId: 'msg-456', to: ['user@example.com'] }],
              txId: 'tx-789',
            }),
        })

      const options: SendEmailOptions = {
        to: 'user@example.com',
        subject: 'Test',
        body: '<p>Hello</p>',
      }

      await transport.send(options)

      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://ches.example.com/api/v1/email',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer token-123',
            'Content-Type': 'application/json',
          }),
        }),
      )
    })

    it('sends email with correct payload', async () => {
      mockConfig()

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'token-123',
              expires_in: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [{ msgId: 'msg-456', to: ['user@example.com'] }],
              txId: 'tx-789',
            }),
        })

      const options: SendEmailOptions = {
        to: 'user@example.com',
        subject: 'Test',
        body: '<p>Hello</p>',
        bodyType: 'html',
      }

      await transport.send(options)

      const [, init] = (fetchMock.mock.calls[1] ?? []) as [string, RequestInit]
      const bodyStr = typeof init?.body === 'string' ? init.body : ''
      const emailBody = JSON.parse(bodyStr) as Record<string, unknown>
      expect(emailBody).toMatchObject({
        from: 'noreply@example.com',
        to: ['user@example.com'],
        subject: 'Test',
        body: '<p>Hello</p>',
        bodyType: 'html',
      })
    })

    it('renders an omitted bodyType as markdown, the documented API default', async () => {
      mockConfig()

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: 'token-123', expires_in: 300 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [{ msgId: 'msg-456', to: ['user@example.com'] }],
              txId: 'tx-789',
            }),
        })

      await transport.send({ to: 'user@example.com', subject: 'Test', body: '# Hello' })

      const [, init] = (fetchMock.mock.calls[1] ?? []) as [string, RequestInit]
      const emailBody = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
        string,
        unknown
      >

      expect(emailBody).toMatchObject({ bodyType: 'html' })
      expect(emailBody.body).toContain('<h1>Hello</h1>')
    })

    it('includes attachments in the CHES payload with preserved content type', async () => {
      mockConfig()

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'token-123',
              expires_in: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [{ msgId: 'msg-456', to: ['user@example.com'] }],
              txId: 'tx-789',
            }),
        })

      await transport.send({
        to: 'user@example.com',
        subject: 'Attachment Test',
        body: 'Hello',
        attachments: [
          {
            filename: 'hello.txt',
            content: Buffer.from('hello world'),
            contentType: 'text/plain',
            sendingMethod: 'attach',
          },
        ],
      })

      const [, init] = (fetchMock.mock.calls[1] ?? []) as [string, RequestInit]
      const bodyStr = typeof init?.body === 'string' ? init.body : ''
      const emailBody = JSON.parse(bodyStr) as Record<string, any>
      expect(emailBody.attachments).toEqual([
        {
          content: Buffer.from('hello world').toString('base64'),
          contentType: 'text/plain',
          encoding: 'base64',
          filename: 'hello.txt',
        },
      ])
    })

    it('handles text body type', async () => {
      mockConfig()

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'token-123',
              expires_in: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [{ msgId: 'msg-text', to: ['user@example.com'] }],
              txId: 'tx-text',
            }),
        })

      const options: SendEmailOptions = {
        to: 'user@example.com',
        subject: 'Plain Text Email',
        body: 'This is plain text',
        bodyType: 'text',
      }

      await transport.send(options)

      const [, init] = (fetchMock.mock.calls[1] ?? []) as [string, RequestInit]
      const bodyStr = typeof init?.body === 'string' ? init.body : ''
      const emailBody = JSON.parse(bodyStr) as Record<string, unknown>
      expect(emailBody.bodyType).toBe('text')
    })

    it('converts markdown to HTML', async () => {
      mockConfig()

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'token-123',
              expires_in: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [{ msgId: 'msg-md', to: ['user@example.com'] }],
              txId: 'tx-md',
            }),
        })

      const options: SendEmailOptions = {
        to: 'user@example.com',
        subject: 'Markdown Email',
        body: '# Heading\n\nThis is **bold** text',
        bodyType: 'markdown',
      }

      await transport.send(options)

      const [, init] = (fetchMock.mock.calls[1] ?? []) as [string, RequestInit]
      const bodyStr = typeof init?.body === 'string' ? init.body : ''
      const emailBody = JSON.parse(bodyStr) as Record<string, unknown>
      expect(emailBody.bodyType).toBe('html')
      expect(String(emailBody.body)).toContain('<h1>')
    })

    it('does not pass raw HTML through markdown rendering', async () => {
      mockConfig()

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'token-123',
              expires_in: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [{ msgId: 'msg-md', to: ['user@example.com'] }],
              txId: 'tx-md',
            }),
        })

      await transport.send({
        to: 'user@example.com',
        subject: 'Markdown Email',
        body: 'Hello <script>alert(1)</script>\n\n<div>safe?</div>',
        bodyType: 'markdown',
      })

      const [, init] = (fetchMock.mock.calls[1] ?? []) as [string, RequestInit]
      const bodyStr = typeof init?.body === 'string' ? init.body : ''
      const emailBody = JSON.parse(bodyStr) as Record<string, unknown>
      expect(String(emailBody.body)).not.toContain('<script>')
      expect(String(emailBody.body)).not.toContain('<div>safe?</div>')
      expect(String(emailBody.body)).toContain('&lt;script&gt;')
    })

    it('uses custom from address when provided', async () => {
      mockConfig()

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'token-123',
              expires_in: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [{ msgId: 'msg-456', to: ['user@example.com'] }],
              txId: 'tx-789',
            }),
        })

      const options: SendEmailOptions = {
        from: 'custom@example.com',
        to: 'user@example.com',
        subject: 'Test',
        body: 'Body',
      }

      await transport.send(options)

      const [, init] = (fetchMock.mock.calls[1] ?? []) as [string, RequestInit]
      const bodyStr = typeof init?.body === 'string' ? init.body : ''
      const emailBody = JSON.parse(bodyStr) as Record<string, unknown>
      expect(emailBody.from).toBe('custom@example.com')
    })

    it('uses configured from address as fallback', async () => {
      mockConfig()

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'token-123',
              expires_in: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [{ msgId: 'msg-456', to: ['user@example.com'] }],
              txId: 'tx-789',
            }),
        })

      const options: SendEmailOptions = {
        to: 'user@example.com',
        subject: 'Test',
        body: 'Body',
      }

      await transport.send(options)

      const [, init] = (fetchMock.mock.calls[1] ?? []) as [string, RequestInit]
      const bodyStr = typeof init?.body === 'string' ? init.body : ''
      const emailBody = JSON.parse(bodyStr) as Record<string, unknown>
      expect(emailBody.from).toBe('noreply@example.com')
    })

    it('handles multiple recipients', async () => {
      mockConfig()

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'token-123',
              expires_in: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [
                { msgId: 'msg-1', to: ['user1@example.com'] },
                { msgId: 'msg-2', to: ['user2@example.com'] },
              ],
              txId: 'tx-multi',
            }),
        })

      const options: SendEmailOptions = {
        to: ['user1@example.com', 'user2@example.com'],
        subject: 'Broadcast',
        body: 'Message',
      }

      await transport.send(options)

      const [, init] = (fetchMock.mock.calls[1] ?? []) as [string, RequestInit]
      const bodyStr = typeof init?.body === 'string' ? init.body : ''
      const emailBody = JSON.parse(bodyStr) as Record<string, unknown>
      expect(emailBody.to).toEqual(['user1@example.com', 'user2@example.com'])
    })

    it('defaults body type to html', async () => {
      mockConfig()

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'token-123',
              expires_in: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [{ msgId: 'msg-456', to: ['user@example.com'] }],
              txId: 'tx-789',
            }),
        })

      const options: SendEmailOptions = {
        to: 'user@example.com',
        subject: 'Test',
        body: 'Body',
      }

      await transport.send(options)

      const [, init] = (fetchMock.mock.calls[1] ?? []) as [string, RequestInit]
      const bodyStr = typeof init?.body === 'string' ? init.body : ''
      const emailBody = JSON.parse(bodyStr) as Record<string, unknown>
      expect(emailBody.bodyType).toBe('html')
    })
  })

  describe('token caching', () => {
    const mockConfig = () => {
      configGetMock.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          'ches.baseUrl': 'https://ches.example.com/api/v1',
          'ches.clientId': 'client-id',
          'ches.clientSecret': 'client-secret',
          'ches.tokenUrl': 'https://auth.example.com/token',
          'ches.from': 'noreply@example.com',
        }
        return map[key]
      })
    }

    it('caches access token across multiple sends', async () => {
      mockConfig()

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'cached-token',
              expires_in: 3600,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [{ msgId: 'msg-1', to: ['user@example.com'] }],
              txId: 'tx-1',
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [{ msgId: 'msg-2', to: ['user@example.com'] }],
              txId: 'tx-2',
            }),
        })

      const options: SendEmailOptions = {
        to: 'user@example.com',
        subject: 'Test',
        body: 'Body',
      }

      await transport.send(options)
      await transport.send(options)

      // Should have 3 fetch calls: 1 token + 2 email
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('refreshes token when expired', async () => {
      mockConfig()

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'expired-token',
              expires_in: 0, // Expired immediately
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [{ msgId: 'msg-1', to: ['user@example.com'] }],
              txId: 'tx-1',
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'new-token',
              expires_in: 3600,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [{ msgId: 'msg-2', to: ['user@example.com'] }],
              txId: 'tx-2',
            }),
        })

      const options: SendEmailOptions = {
        to: 'user@example.com',
        subject: 'Test',
        body: 'Body',
      }

      await transport.send(options)
      await transport.send(options)

      expect(fetchMock.mock.calls.length).toBeGreaterThan(2)
    })
  })

  describe('error handling', () => {
    const mockConfig = () => {
      configGetMock.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          'ches.baseUrl': 'https://ches.example.com/api/v1',
          'ches.clientId': 'client-id',
          'ches.clientSecret': 'client-secret',
          'ches.tokenUrl': 'https://auth.example.com/token',
          'ches.from': 'noreply@example.com',
        }
        return map[key]
      })
    }

    it('throws error for CHES email API errors', async () => {
      mockConfig()

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'token-123',
              expires_in: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: () => Promise.resolve('Invalid email address'),
        })

      const options: SendEmailOptions = {
        to: 'invalid@example.com',
        subject: 'Test',
        body: 'Body',
      }

      await expect(transport.send(options)).rejects.toThrow()
    })

    it('throws error for CHES token endpoint error', async () => {
      mockConfig()

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      })

      const options: SendEmailOptions = {
        to: 'user@example.com',
        subject: 'Test',
        body: 'Body',
      }

      await expect(transport.send(options)).rejects.toThrow()
    })

    it('throws BadGatewayException for non-JSON token response', async () => {
      mockConfig()

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      })

      const options: SendEmailOptions = {
        to: 'user@example.com',
        subject: 'Test',
        body: 'Body',
      }

      await expect(transport.send(options)).rejects.toThrow(BadGatewayException)
    })

    it('throws BadGatewayException for non-JSON email response', async () => {
      mockConfig()

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'token-123',
              expires_in: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.reject(new Error('Invalid JSON')),
        })

      const options: SendEmailOptions = {
        to: 'user@example.com',
        subject: 'Test',
        body: 'Body',
      }

      await expect(transport.send(options)).rejects.toThrow(BadGatewayException)
    })
  })

  describe('request timeout', () => {
    const configured = (timeoutMs?: number) =>
      configGetMock.mockImplementation((key: string) => {
        const map: Record<string, unknown> = {
          'ches.baseUrl': 'https://ches.example.com/api/v1',
          'ches.clientId': 'client-id',
          'ches.clientSecret': 'client-secret',
          'ches.tokenUrl': 'https://auth.example.com/token',
          'ches.from': 'noreply@gov.bc.ca',
          'ches.timeoutMs': timeoutMs,
        }
        return map[key]
      })
    const tokenOk = () =>
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok', expires_in: 300 }),
      })
    const timedOut = () =>
      Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })

    it('gives every CHES request a deadline', async () => {
      configured(15_000)
      tokenOk()
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ msgId: 'm1' }], txId: 't1' }),
      })

      await transport.send({ to: 'user@example.com', subject: 'Hi', body: 'Hello' })

      for (const [, init] of fetchMock.mock.calls) {
        expect(init.signal).toBeInstanceOf(AbortSignal)
      }
    })

    it('reports a CHES that never answers as a 504 naming CHES', async () => {
      configured(15_000)
      tokenOk()
      fetchMock.mockRejectedValueOnce(timedOut())

      const sending = transport.send({ to: 'user@example.com', subject: 'Hi', body: 'Hello' })

      await expect(sending).rejects.toBeInstanceOf(GatewayTimeoutException)
      await expect(sending).rejects.toThrow('CHES email request timed out after 15s')
    })

    it('times out the token request too', async () => {
      configured(15_000)
      fetchMock.mockRejectedValueOnce(timedOut())

      await expect(
        transport.send({ to: 'user@example.com', subject: 'Hi', body: 'Hello' }),
      ).rejects.toThrow('CHES token request timed out after 15s')
    })

    it('leaves other network errors as they are', async () => {
      configured(15_000)
      tokenOk()
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))

      await expect(
        transport.send({ to: 'user@example.com', subject: 'Hi', body: 'Hello' }),
      ).rejects.toThrow('fetch failed')
    })
  })

  describe('concurrency limit', () => {
    const config = (overrides: Record<string, unknown>) =>
      ({
        get: (key: string) =>
          ({
            'ches.baseUrl': 'https://ches.example.com/api/v1',
            'ches.clientId': 'client-id',
            'ches.clientSecret': 'client-secret',
            'ches.tokenUrl': 'https://auth.example.com/token',
            'ches.from': 'noreply@gov.bc.ca',
            redis: { host: 'localhost', port: 6379 },
            ...overrides,
          })[key],
      }) as unknown as ConfigService
    const respond = () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok', expires_in: 300 }),
      })
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ msgId: 'm1' }], txId: 't1' }),
      })
    }

    it('sends each email through the shared limit', async () => {
      const run = vi
        .spyOn(RedisConcurrencyLimiter.prototype, 'run')
        .mockImplementation((fn) => fn())
      respond()
      const limited = new ChesEmailTransport(config({ 'ches.maxConcurrentRequests': 5 }))

      await expect(
        limited.send({ to: 'user@example.com', subject: 'Hi', body: 'Hello' }),
      ).resolves.toMatchObject({ messageId: 'm1' })
      // The email POST only: the token request is cached and rare.
      expect(run).toHaveBeenCalledTimes(1)
      run.mockRestore()
    })

    it('holds startup until the limiter can reach Redis, so the first sends are limited', async () => {
      const handlers: Record<string, () => void> = {}
      vi.mocked(createRedisClient).mockReturnValueOnce({
        status: 'connecting',
        once: vi.fn((event: string, handler: () => void) => (handlers[event] = handler)),
        quit: vi.fn().mockResolvedValue('OK'),
      } as never)
      const limited = new ChesEmailTransport(config({ 'ches.maxConcurrentRequests': 5 }))

      let started = false
      const init = limited.onModuleInit().then(() => (started = true))
      await Promise.resolve()
      expect(started).toBe(false)

      handlers.ready()
      await init
      expect(started).toBe(true)
    })

    it('gets the token once it holds a slot, so a long wait cannot expire it', async () => {
      const run = vi.spyOn(RedisConcurrencyLimiter.prototype, 'run').mockImplementation((fn) => {
        expect(fetchMock).not.toHaveBeenCalled()
        return fn()
      })
      respond()
      const limited = new ChesEmailTransport(config({ 'ches.maxConcurrentRequests': 5 }))

      await limited.send({ to: 'user@example.com', subject: 'Hi', body: 'Hello' })

      expect(fetchMock).toHaveBeenCalledTimes(2)
      run.mockRestore()
    })

    it('sends unlimited when the limit is 0', async () => {
      const run = vi.spyOn(RedisConcurrencyLimiter.prototype, 'run')
      respond()
      const unlimited = new ChesEmailTransport(config({ 'ches.maxConcurrentRequests': 0 }))

      await unlimited.send({ to: 'user@example.com', subject: 'Hi', body: 'Hello' })

      expect(run).not.toHaveBeenCalled()
      run.mockRestore()
    })
  })

  describe('rejected token', () => {
    const unlimited = () =>
      new ChesEmailTransport({
        get: (key: string) =>
          ({
            'ches.baseUrl': 'https://ches.example.com/api/v1',
            'ches.clientId': 'client-id',
            'ches.clientSecret': 'client-secret',
            'ches.tokenUrl': 'https://auth.example.com/token',
            'ches.from': 'noreply@gov.bc.ca',
          })[key],
      } as unknown as ConfigService)
    const token = (value: string) =>
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: value, expires_in: 300 }),
      })
    const unauthorized = () =>
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => '{"detail":"Token claims invalid: [\\"exp\\"]=\\"token expired\\""}',
      })
    const authHeaders = () =>
      fetchMock.mock.calls
        .filter(([url]) => String(url).endsWith('/email'))
        .map(([, init]) => (init.headers as Record<string, string>).Authorization)

    it('retries once with a new token when CHES rejects the cached one', async () => {
      token('stale')
      unauthorized()
      token('fresh')
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ msgId: 'm1' }], txId: 't1' }),
      })

      await expect(
        unlimited().send({ to: 'user@example.com', subject: 'Hi', body: 'Hello' }),
      ).resolves.toMatchObject({ messageId: 'm1' })
      expect(authHeaders()).toEqual(['Bearer stale', 'Bearer fresh'])
    })

    it('reports a token CHES still rejects after the retry', async () => {
      token('stale')
      unauthorized()
      token('fresh')
      unauthorized()

      await expect(
        unlimited().send({ to: 'user@example.com', subject: 'Hi', body: 'Hello' }),
      ).rejects.toBeInstanceOf(UnauthorizedException)
      expect(authHeaders()).toHaveLength(2)
    })
  })

  describe('error classification', () => {
    const transport = () =>
      new ChesEmailTransport({
        get: (key: string) =>
          ({
            'ches.baseUrl': 'https://ches.example.com/api/v1',
            'ches.clientId': 'client-id',
            'ches.clientSecret': 'client-secret',
            'ches.tokenUrl': 'https://auth.example.com/token',
            'ches.from': 'noreply@gov.bc.ca',
            'ches.timeoutMs': 15_000,
          })[key],
      } as unknown as ConfigService)
    const send = (t = transport()) =>
      t.send({ to: 'user@example.com', subject: 'Hi', body: 'Hello' })
    const tokenOk = () =>
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok', expires_in: 300 }),
      })
    const emailStatus = (status: number, body = '{"detail":"nope"}') =>
      fetchMock.mockResolvedValueOnce({ ok: false, status, text: async () => body })

    it.each([503, 502, 500, 429, 408])(
      'treats a %i from CHES as transient: nothing was accepted',
      async (status) => {
        tokenOk()
        emailStatus(status)
        await expect(send()).rejects.toBeInstanceOf(TransientDeliveryError)
      },
    )

    it.each([400, 404, 422])('treats a %i as a problem with this message', async (status) => {
      tokenOk()
      emailStatus(status)
      const error = await send().catch((caught: unknown) => caught)
      expect(error).not.toBeInstanceOf(TransientDeliveryError)
    })

    it('treats CHES being unreachable as transient', async () => {
      tokenOk()
      fetchMock.mockRejectedValueOnce(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
      )
      await expect(send()).rejects.toThrow('CHES email unreachable: ECONNREFUSED')
    })

    it('does not retry a connection cut mid-request: CHES may have taken it', async () => {
      tokenOk()
      fetchMock.mockRejectedValueOnce(
        Object.assign(new TypeError('terminated'), { cause: { code: 'ECONNRESET' } }),
      )
      const error = await send().catch((caught: unknown) => caught)
      expect(error).not.toBeInstanceOf(TransientDeliveryError)
    })

    it('keeps an email timeout as an unknown outcome, not transient', async () => {
      tokenOk()
      fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))
      const error = await send().catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(GatewayTimeoutException)
      expect(error).not.toBeInstanceOf(TransientDeliveryError)
    })

    it('treats a token timeout as transient: no email was sent', async () => {
      fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))
      await expect(send()).rejects.toBeInstanceOf(TransientDeliveryError)
    })

    it('raises a 503 inside the circuit breaker, where it counts against CHES', async () => {
      let seen: unknown
      vi.spyOn(RedisCircuitBreaker.prototype, 'run').mockImplementation(async (fn) => {
        try {
          return await fn()
        } catch (error) {
          seen = error
          throw error
        }
      })
      vi.spyOn(RedisConcurrencyLimiter.prototype, 'run').mockImplementation((fn) => fn())
      const limited = new ChesEmailTransport({
        get: (key: string) =>
          ({
            'ches.baseUrl': 'https://ches.example.com/api/v1',
            'ches.clientId': 'client-id',
            'ches.clientSecret': 'client-secret',
            'ches.tokenUrl': 'https://auth.example.com/token',
            'ches.maxConcurrentRequests': 5,
            redis: { host: 'localhost', port: 6379 },
          })[key],
      } as unknown as ConfigService)
      tokenOk()
      emailStatus(503, '{"detail":"Server is shutting down"}')

      await expect(send(limited)).rejects.toBeInstanceOf(TransientDeliveryError)
      expect(seen).toBeInstanceOf(TransientDeliveryError)
      vi.restoreAllMocks()
    })

    it('sends through the circuit breaker, and counts timeouts as CHES being unwell', async () => {
      let isFailure: ((error: unknown) => boolean) | undefined
      const run = vi.spyOn(RedisCircuitBreaker.prototype, 'run').mockImplementation(function (
        this: RedisCircuitBreaker,
        fn,
      ) {
        isFailure = (this as unknown as { options: { isFailure: typeof isFailure } }).options
          .isFailure
        return fn()
      })
      const limited = new ChesEmailTransport({
        get: (key: string) =>
          ({
            'ches.baseUrl': 'https://ches.example.com/api/v1',
            'ches.clientId': 'client-id',
            'ches.clientSecret': 'client-secret',
            'ches.tokenUrl': 'https://auth.example.com/token',
            'ches.maxConcurrentRequests': 5,
            redis: { host: 'localhost', port: 6379 },
          })[key],
      } as unknown as ConfigService)
      vi.spyOn(RedisConcurrencyLimiter.prototype, 'run').mockImplementation((fn) => fn())
      tokenOk()
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ msgId: 'm1' }], txId: 't1' }),
      })

      await send(limited)

      expect(run).toHaveBeenCalledTimes(1)
      expect(isFailure?.(new TransientDeliveryError('503'))).toBe(true)
      expect(isFailure?.(new GatewayTimeoutException('slow'))).toBe(true)
      expect(isFailure?.(new BadRequestException('bad address'))).toBe(false)
      vi.restoreAllMocks()
    })
  })
})
