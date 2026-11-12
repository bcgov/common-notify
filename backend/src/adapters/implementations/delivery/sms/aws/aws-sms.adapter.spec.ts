import { Logger } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { AwsSmsTransport } from '../../../../../../src/adapters/implementations/delivery/sms/aws/aws-sms.adapter'
import type { SendSmsOptions } from '../../../../../../src/adapters/interfaces'
import { TransientDeliveryError } from '../../../../../../src/adapters/delivery-errors'

const mockClientSend = vi.fn()
const mockClientConfig = vi.fn()
vi.mock('@aws-sdk/client-pinpoint-sms-voice-v2', () => ({
  PinpointSMSVoiceV2Client: class {
    constructor(config: unknown) {
      mockClientConfig(config)
    }
    send = mockClientSend
  },
  SendTextMessageCommand: class {
    constructor(readonly input: unknown) {}
  },
}))

type ConfigOverrides = {
  credentialsDir?: string
  fromNumber?: string
  omitFromNumber?: boolean
}

const configured: ConfigOverrides = { credentialsDir: '/run/secrets/aws-sms' }

/** An AWS SDK ServiceException carries its HTTP status on `$metadata`. */
const awsError = (message: string, httpStatusCode: number) =>
  Object.assign(new Error(message), { $metadata: { httpStatusCode } })

const sentInputs = () => mockClientSend.mock.calls.map(([command]) => command.input)

describe('AwsSmsTransport', () => {
  async function createModule(overrides: ConfigOverrides = {}): Promise<AwsSmsTransport> {
    const get = vi.fn((key: string) => {
      if (key === 'awsSms.credentialsDir') return overrides.credentialsDir
      if (key === 'awsSms.region') return 'ca-central-1'
      if (key === 'awsSms.fromNumber') {
        return overrides.omitFromNumber ? undefined : (overrides.fromNumber ?? '+15551234567')
      }
      return undefined
    })

    const module: TestingModule = await Test.createTestingModule({
      providers: [AwsSmsTransport, { provide: ConfigService, useValue: { get } }],
    }).compile()

    return module.get(AwsSmsTransport)
  }

  beforeEach(() => {
    mockClientSend.mockReset()
    mockClientConfig.mockReset()
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes name as aws', async () => {
    expect((await createModule(configured)).name).toBe('aws')
  })

  it('builds the client to read its access key from the mounted Secret', async () => {
    await createModule(configured)
    expect(mockClientConfig).toHaveBeenCalledWith({
      region: 'ca-central-1',
      credentials: expect.any(Function),
    })
  })

  it('logs instead of sending when no credentials directory is configured', async () => {
    const transport = await createModule()
    const result = await transport.send({ to: '+15559876543', body: 'Test message' })

    expect(result.messageId).toMatch(/^dev-aws-\d+$/)
    expect(result.providerResponse).toBe('logged')
    expect(result.results).toEqual([expect.objectContaining({ to: '+15559876543', success: true })])
    expect(mockClientSend).not.toHaveBeenCalled()
  })

  it('throws when there is no from number', async () => {
    const transport = await createModule({ ...configured, omitFromNumber: true })
    await expect(transport.send({ to: '+15559876543', body: 'Hi' })).rejects.toThrow(
      'SMS from number is required (set awsSms.fromNumber or pass in options)',
    )
  })

  it('sends one transactional message per recipient from the default number', async () => {
    mockClientSend
      .mockResolvedValueOnce({ MessageId: 'm1' })
      .mockResolvedValueOnce({ MessageId: 'm2' })
    const transport = await createModule(configured)

    const result = await transport.send({ to: ['+15559876543', '+15550000001'], body: 'Hello' })

    expect(sentInputs()).toEqual([
      {
        DestinationPhoneNumber: '+15559876543',
        OriginationIdentity: '+15551234567',
        MessageBody: 'Hello',
        MessageType: 'TRANSACTIONAL',
      },
      expect.objectContaining({ DestinationPhoneNumber: '+15550000001' }),
    ])
    expect(result).toEqual({
      messageId: 'm1',
      providerResponse: 'sent to 2 of 2 recipient(s)',
      results: [
        { to: '+15559876543', success: true, messageId: 'm1' },
        { to: '+15550000001', success: true, messageId: 'm2' },
      ],
    })
  })

  it('sends from the number passed in, over the default', async () => {
    mockClientSend.mockResolvedValue({ MessageId: 'm1' })
    const transport = await createModule(configured)

    await transport.send({ to: '+15559876543', body: 'Hi', from: '+12505550100' })

    expect(sentInputs()[0]).toMatchObject({ OriginationIdentity: '+12505550100' })
  })

  it('reads the recipients and body of a NotifySmsChannel', async () => {
    mockClientSend.mockResolvedValue({ MessageId: 'm1' })
    const transport = await createModule(configured)

    await transport.send({
      recipients: { to: ['+15559876543'] },
      content: { body: 'From the worker' },
    } as unknown as SendSmsOptions)

    expect(sentInputs()[0]).toMatchObject({
      DestinationPhoneNumber: '+15559876543',
      MessageBody: 'From the worker',
    })
  })

  it('tags the send so a delivery event can be matched back to the notification', async () => {
    mockClientSend.mockResolvedValue({ MessageId: 'm1' })
    const transport = await createModule(configured)

    await transport.send({ to: '+15559876543', body: 'Hi', tag: 'notify-123' })

    expect(sentInputs()[0]).toMatchObject({ Context: { notifyId: 'notify-123' } })
  })

  it('reports a partial failure per recipient instead of throwing', async () => {
    mockClientSend
      .mockResolvedValueOnce({ MessageId: 'm1' })
      .mockRejectedValueOnce(awsError('Destination is opted out', 400))
    const transport = await createModule(configured)

    const result = await transport.send({ to: ['+15559876543', '+15550000001'], body: 'Hello' })

    expect(result.providerResponse).toBe('sent to 1 of 2 recipient(s)')
    expect(result.results).toEqual([
      { to: '+15559876543', success: true, messageId: 'm1' },
      { to: '+15550000001', success: false, error: 'Destination is opted out' },
    ])
  })

  it('throws when every recipient fails, so the job is retried', async () => {
    mockClientSend.mockRejectedValue(awsError('Origination identity not registered', 400))
    const transport = await createModule(configured)

    const error = await transport
      .send({ to: ['+15559876543', '+15550000001'], body: 'Hello' })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(TransientDeliveryError)
    expect((error as Error).message).toBe('AWS SMS send failed for all 2 recipient(s)')
  })

  describe('provider outages', () => {
    it.each([429, 500, 503])('treats a %i from AWS as transient', async (status) => {
      mockClientSend.mockRejectedValue(awsError('Unavailable', status))
      const transport = await createModule(configured)

      await expect(transport.send({ to: '+15559876543', body: 'Hi' })).rejects.toBeInstanceOf(
        TransientDeliveryError,
      )
    })

    it('treats AWS being unreachable as transient', async () => {
      mockClientSend.mockRejectedValue(
        Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      )
      const transport = await createModule(configured)

      await expect(transport.send({ to: '+15559876543', body: 'Hi' })).rejects.toBeInstanceOf(
        TransientDeliveryError,
      )
    })

    it('stops at an outage, keeping earlier successes and leaving the rest owed', async () => {
      mockClientSend
        .mockResolvedValueOnce({ MessageId: 'm1' })
        .mockRejectedValueOnce(awsError('Rate exceeded', 429))
      const transport = await createModule(configured)

      const result = await transport.send({
        to: ['+15559876543', '+15550000001', '+15550000002'],
        body: 'Hello',
      })

      expect(mockClientSend).toHaveBeenCalledTimes(2)
      expect(result.results?.[0]).toEqual({ to: '+15559876543', success: true, messageId: 'm1' })
      expect(result.results?.slice(1)).toEqual([
        expect.objectContaining({ to: '+15550000001', success: false, transient: true }),
        expect.objectContaining({ to: '+15550000002', success: false, transient: true }),
      ])
    })
  })
})
