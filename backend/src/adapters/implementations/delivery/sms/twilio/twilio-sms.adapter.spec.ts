import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TwilioSmsTransport } from '../../../../../../src/adapters/implementations/delivery/sms/twilio/twilio-sms.adapter';
import type { SendSmsResult } from '../../../../../../src/adapters/interfaces';

const mockMessagesCreate = vi.fn();
vi.mock('twilio', () => ({
  __esModule: true,
  default: vi.fn(() => ({ messages: { create: mockMessagesCreate } })),
}));

type ConfigOverrides = {
  accountSid?: string;
  authToken?: string;
  fromNumber?: string;
  omitFromNumber?: boolean;
};

describe('TwilioSmsTransport', () => {
  let transport: TwilioSmsTransport;
  let configGetMock: ReturnType<typeof vi.fn>;

  async function createModule(
    overrides: ConfigOverrides = {},
  ): Promise<TwilioSmsTransport> {
    configGetMock = vi.fn((key: string) => {
      if (key === 'twilio.accountSid') return overrides.accountSid;
      if (key === 'twilio.authToken') return overrides.authToken;
      if (key === 'twilio.fromNumber') {
        return overrides.omitFromNumber
          ? undefined
          : (overrides.fromNumber ?? '+15551234567');
      }
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwilioSmsTransport,
        { provide: ConfigService, useValue: { get: configGetMock } },
      ],
    }).compile();

    return module.get(TwilioSmsTransport);
  }

  beforeEach(() => {
    mockMessagesCreate.mockReset();
  });

  it('exposes name as twilio', async () => {
    transport = await createModule({ accountSid: 'AC', authToken: 'tok' });
    expect(transport.name).toBe('twilio');
  });

  it('returns dev-style result without calling Twilio when credentials not configured', async () => {
    transport = await createModule();
    const result: SendSmsResult = await transport.send({
      to: '+15559876543',
      body: 'Test message',
    });

    expect(result.messageId).toMatch(/^dev-\d+$/);
    expect(result.providerResponse).toBe('logged');
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it('throws when from number is missing', async () => {
    transport = await createModule({
      accountSid: 'AC',
      authToken: 'tok',
      omitFromNumber: true,
    });

    await expect(
      transport.send({ to: '+15559876543', body: 'Hi' }),
    ).rejects.toThrow(
      'SMS from number is required (set twilio.fromNumber or pass in options)',
    );
  });

  it('returns messageId and providerResponse from Twilio when credentials configured', async () => {
    transport = await createModule({
      accountSid: 'AC123',
      authToken: 'token',
      fromNumber: '+15551234567',
    });
    mockMessagesCreate.mockResolvedValue({
      sid: 'SM123456',
      status: 'queued',
    });

    const result = await transport.send({
      to: '+15559876543',
      body: 'Hello',
    });

    expect(result).toEqual({
      messageId: 'SM123456',
      providerResponse: 'queued',
    });
  });

  it('uses from in options over config when credentials configured', async () => {
    transport = await createModule({
      accountSid: 'AC123',
      authToken: 'token',
      fromNumber: '+15551234567',
    });
    mockMessagesCreate.mockResolvedValue({ sid: 'SM1', status: 'sent' });

    await transport.send({
      to: '+15559876543',
      body: 'Hi',
      from: '+15559999999',
    });

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ from: '+15559999999' }),
    );
  });
});
