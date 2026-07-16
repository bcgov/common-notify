import { Type } from '@nestjs/common'
import { ChesEmailTransport } from './implementations/delivery/email/ches/ches-email.adapter'
import { NodemailerEmailTransport } from './implementations/delivery/email/nodemailer/nodemailer-email.adapter'
import { LogEmailTransport } from './implementations/delivery/email/log/log-email.adapter'
import { TwilioSmsTransport } from './implementations/delivery/sms/twilio/twilio-sms.adapter'
import type { IEmailTransport, ISmsTransport } from './interfaces'

export const EMAIL_ADAPTER_REGISTRY: Record<string, Type<IEmailTransport>> = {
  ches: ChesEmailTransport,
  nodemailer: NodemailerEmailTransport,
  // Non-delivering sink for load testing (DELIVERY_EMAIL_ADAPTER=log).
  log: LogEmailTransport,
}

export const SMS_ADAPTER_REGISTRY: Record<string, Type<ISmsTransport>> = {
  twilio: TwilioSmsTransport,
}
