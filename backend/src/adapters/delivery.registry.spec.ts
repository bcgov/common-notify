import {
  EMAIL_ADAPTER_REGISTRY,
  SMS_ADAPTER_REGISTRY,
} from '../../src/adapters/delivery.registry';
import { ChesEmailTransport } from '../../src/adapters/implementations/delivery/email/ches/ches-email.adapter';
import { NodemailerEmailTransport } from '../../src/adapters/implementations/delivery/email/nodemailer/nodemailer-email.adapter';
import { TwilioSmsTransport } from '../../src/adapters/implementations/delivery/sms/twilio/twilio-sms.adapter';

describe('delivery.registry', () => {
  it('EMAIL_ADAPTER_REGISTRY maps ches to ChesEmailTransport', () => {
    expect(EMAIL_ADAPTER_REGISTRY.ches).toBe(ChesEmailTransport);
  });

  it('EMAIL_ADAPTER_REGISTRY maps nodemailer to NodemailerEmailTransport', () => {
    expect(EMAIL_ADAPTER_REGISTRY.nodemailer).toBe(NodemailerEmailTransport);
  });

  it('EMAIL_ADAPTER_REGISTRY contains only expected keys', () => {
    expect(Object.keys(EMAIL_ADAPTER_REGISTRY).sort()).toEqual([
      'ches',
      'nodemailer',
    ]);
  });

  it('SMS_ADAPTER_REGISTRY maps twilio to TwilioSmsTransport', () => {
    expect(SMS_ADAPTER_REGISTRY.twilio).toBe(TwilioSmsTransport);
  });

  it('SMS_ADAPTER_REGISTRY contains only expected keys', () => {
    expect(Object.keys(SMS_ADAPTER_REGISTRY)).toEqual(['twilio']);
  });
});
