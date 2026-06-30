import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { BadGatewayException } from '@nestjs/common'
import { ChesEmailTransport } from '../../../../../../src/adapters/implementations/delivery/email/ches/ches-email.adapter'
import type { SendEmailOptions, SendEmailResult } from '../../../../../../src/adapters/interfaces'

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
})
