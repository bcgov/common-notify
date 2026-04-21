import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import {
  ISmsTransport,
  SendSmsOptions,
  SendSmsResult,
} from '../../../../interfaces';

@Injectable()
export class TwilioSmsTransport implements ISmsTransport {
  readonly name = 'twilio';
  private readonly logger = new Logger(TwilioSmsTransport.name);
  private client: ReturnType<typeof twilio> | null = null;

  constructor(private readonly configService: ConfigService) {
    const accountSid = this.configService.get<string>('twilio.accountSid');
    const authToken = this.configService.get<string>('twilio.authToken');
    if (accountSid && authToken) {
      this.client = twilio(accountSid, authToken);
    } else {
      this.logger.warn(
        'Twilio credentials not configured - SMS will be logged but not sent',
      );
    }
  }

  async send(options: SendSmsOptions): Promise<SendSmsResult> {
    const from =
      options.from ?? this.configService.get<string>('twilio.fromNumber');
    if (!from) {
      throw new Error(
        'SMS from number is required (set twilio.fromNumber or pass in options)',
      );
    }

    if (!this.client) {
      this.logger.log(
        `[Dev mode] Would send SMS to ${options.to}: ${options.body.slice(0, 50)}...`,
      );
      return {
        messageId: `dev-${Date.now()}`,
        providerResponse: 'logged',
      };
    }

    const message = await this.client.messages.create({
      body: options.body,
      from,
      to: options.to,
    });

    return {
      messageId: message.sid,
      providerResponse: message.status,
    };
  }
}
