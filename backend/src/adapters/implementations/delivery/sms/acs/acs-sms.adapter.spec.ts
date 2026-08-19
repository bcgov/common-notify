import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { Logger } from '@nestjs/common'
import { AcsSmsTransport } from '../../../../../../src/adapters/implementations/delivery/sms/acs/acs-sms.adapter'
import type { SendSmsResult } from '../../../../../../src/adapters/interfaces'

const mockSend = vi.fn()
vi.mock('@azure/communication-sms', () => ({
  SmsClient: class {
    send = mockSend
  },
}))

type ConfigOverrides = {
  connectionString?: string
  fromNumber?: string
  omitFromNumber?: boolean
}

describe('AcsSmsTransport', () => {
  let transport: AcsSmsTransport
  let configGetMock: ReturnType<typeof vi.fn>

  async function createModule(overrides: ConfigOverrides = {}): Promise<AcsSmsTransport> {
    configGetMock = vi.fn((key: string) => {
      if (key === 'acs.connectionString') return overrides.connectionString
      if (key === 'acs.fromNumber') {
        return overrides.omitFromNumber ? undefined : (overrides.fromNumber ?? '+15551234567')
      }
      return undefined
    })

    const module: TestingModule = await Test.createTestingModule({
      providers: [AcsSmsTransport, { provide: ConfigService, useValue: { get: configGetMock } }],
    }).compile()

    return module.get(AcsSmsTransport)
  }

  beforeEach(() => {
    mockSend.mockReset()
  })

  it('exposes name as acs', async () => {
    transport = await createModule({ connectionString: 'endpoint=https://example;accesskey=key' })
    expect(transport.name).toBe('acs')
  })

  it('returns dev-style result without calling ACS when connection string is not configured', async () => {
    transport = await createModule()
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

    const result: SendSmsResult = await transport.send({
      to: '+15559876543',
      body: 'Test message',
    })

    expect(result.messageId).toMatch(/^dev-acs-\d+$/)
    expect(result.providerResponse).toBe('logged')
    expect(mockSend).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(
      '[Dev mode] Would send SMS via ACS to +15559876543: Test message...',
    )

    logSpy.mockRestore()
  })

  it('throws when from number is missing', async () => {
    transport = await createModule({
      connectionString: 'endpoint=https://example;accesskey=key',
      omitFromNumber: true,
    })

    await expect(transport.send({ to: '+15559876543', body: 'Hi' })).rejects.toThrow(
      'SMS from number is required (set acs.fromNumber or pass in options)',
    )
  })

  it('returns messageId and providerResponse from ACS when configured', async () => {
    transport = await createModule({
      connectionString: 'endpoint=https://example;accesskey=key',
      fromNumber: '+15551234567',
    })
    mockSend.mockResolvedValue([
      {
        to: '+15559876543',
        messageId: 'acs-message-123',
        successful: true,
        httpStatusCode: 202,
      },
    ])

    const result = await transport.send({
      to: '+15559876543',
      body: 'Hello',
    })

    expect(mockSend).toHaveBeenCalledWith({
      from: '+15551234567',
      to: ['+15559876543'],
      message: 'Hello',
    })
    expect(result).toEqual({
      messageId: 'acs-message-123',
      providerResponse: 'sent to 1 recipient(s)',
    })
  })

  it('throws and logs recipient details when ACS returns mixed success and failure', async () => {
    transport = await createModule({
      connectionString: 'endpoint=https://example;accesskey=key',
      fromNumber: '+15551234567',
    })
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    mockSend.mockResolvedValue([
      {
        to: '+15559876543',
        messageId: 'acs-message-123',
        successful: true,
        httpStatusCode: 202,
      },
      {
        to: '+15550000001',
        successful: false,
        errorMessage: 'Invalid recipient',
        httpStatusCode: 400,
      },
    ])

    await expect(
      transport.send({
        to: ['+15559876543', '+15550000001'],
        body: 'Hello',
      }),
    ).rejects.toThrow('ACS send failed for 1 of 2 recipients')

    expect(errorSpy).toHaveBeenCalledWith(
      'ACS send failures: [{"to":"+15550000001","errorMessage":"Invalid recipient","httpStatusCode":400}]',
    )

    errorSpy.mockRestore()
  })
})
