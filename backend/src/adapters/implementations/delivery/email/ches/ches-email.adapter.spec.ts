import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
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

  it('exposes name as ches', () => {
    expect(transport.name).toBe('ches')
  })

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

  it('returns SendEmailResult when send succeeds', async () => {
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
})
