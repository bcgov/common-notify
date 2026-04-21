import { Type } from '@nestjs/common';
import { ChesEmailTransport } from './implementations/delivery/email/ches/ches-email.adapter';
import { NodemailerEmailTransport } from './implementations/delivery/email/nodemailer/nodemailer-email.adapter';
import { TwilioSmsTransport } from './implementations/delivery/sms/twilio/twilio-sms.adapter';
import type { IEmailTransport, ISmsTransport } from './interfaces';

export const EMAIL_ADAPTER_REGISTRY: Record<string, Type<IEmailTransport>> = {
  ches: ChesEmailTransport,
  nodemailer: NodemailerEmailTransport,
};

export const SMS_ADAPTER_REGISTRY: Record<string, Type<ISmsTransport>> = {
  twilio: TwilioSmsTransport,
};
