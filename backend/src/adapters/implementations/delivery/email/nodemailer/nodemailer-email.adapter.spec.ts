import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { NodemailerEmailTransport } from '../../../../../../src/adapters/implementations/delivery/email/nodemailer/nodemailer-email.adapter'
import type { SendEmailOptions, SendEmailResult } from '../../../../../../src/adapters/interfaces'

const sendMailMock = vi.fn()
vi.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: sendMailMock }),
}))

describe('NodemailerEmailTransport', () => {
  let transport: NodemailerEmailTransport
  let configGetMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    sendMailMock.mockReset()
    configGetMock = vi.fn()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodemailerEmailTransport,
        {
          provide: ConfigService,
          useValue: { get: configGetMock },
        },
      ],
    }).compile()

    transport = module.get(NodemailerEmailTransport)
  })

  it('exposes name as nodemailer', () => {
    expect(transport.name).toBe('nodemailer')
  })

  it('returns SendEmailResult with messageId and providerResponse when send succeeds', async () => {
    sendMailMock.mockResolvedValue({
      messageId: '<abc@example.com>',
      response: '250 OK',
    })
    configGetMock.mockImplementation((key: string, fallback: string) =>
      key === 'nodemailer.from' ? fallback : undefined,
    )

    const options: SendEmailOptions = {
      to: 'recipient@example.com',
      subject: 'Test',
      body: '<p>Hello</p>',
    }

    const result: SendEmailResult = await transport.send(options)

    expect(result).toEqual({
      messageId: '<abc@example.com>',
      providerResponse: '250 OK',
    })
  })

  it('uses from in options over config default', async () => {
    sendMailMock.mockResolvedValue({ messageId: 'x', response: 'OK' })
    configGetMock.mockReturnValue('noreply@localhost')

    await transport.send({
      to: 'a@b.com',
      subject: 'S',
      body: 'B',
      from: 'custom@example.com',
    })

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'custom@example.com' }),
    )
  })

  it('includes only attach-type attachments in sendMail payload', async () => {
    sendMailMock.mockResolvedValue({ messageId: 'x', response: 'OK' })
    configGetMock.mockReturnValue('noreply@localhost')

    await transport.send({
      to: 'a@b.com',
      subject: 'S',
      body: 'B',
      attachments: [
        {
          filename: 'a.pdf',
          content: Buffer.from('x'),
          sendingMethod: 'attach',
        },
        { filename: 'b.pdf', content: 'link', sendingMethod: 'link' },
      ],
    })

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [{ filename: 'a.pdf', content: Buffer.from('x') }],
      }),
    )
  })

  it('returns undefined messageId when nodemailer returns non-string', async () => {
    sendMailMock.mockResolvedValue({ messageId: 123, response: 'OK' })
    configGetMock.mockReturnValue('noreply@localhost')

    const result = await transport.send({
      to: 'a@b.com',
      subject: 'S',
      body: 'B',
    })

    expect(result.messageId).toBeUndefined()
    expect(result.providerResponse).toBe('OK')
  })
})
