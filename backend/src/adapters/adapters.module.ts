import { DynamicModule, Module, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChesEmailTransport } from './implementations/delivery/email/ches/ches-email.adapter';
import { NodemailerEmailTransport } from './implementations/delivery/email/nodemailer/nodemailer-email.adapter';
import { TwilioSmsTransport } from './implementations/delivery/sms/twilio/twilio-sms.adapter';
import {
  EMAIL_ADAPTER,
  EMAIL_ADAPTER_MAP,
  SMS_ADAPTER,
  SMS_ADAPTER_MAP,
  SENDER_STORE,
} from './tokens';
import type { IEmailTransport, ISmsTransport } from './interfaces';
import { InMemoryTemplateStore } from './implementations/storage/in-memory/in-memory-template.store';
import { InMemorySenderStore } from './implementations/storage/in-memory/in-memory-sender.store';

export interface AdaptersModuleOptions {
  emailAdapter?: Type<IEmailTransport>;
  smsAdapter?: Type<ISmsTransport>;
}

/**
 * Shared adapters module - provides email and SMS delivery adapters for use by
 * gc-notify, notifications, and other API packages.
 */
@Module({})
export class AdaptersModule {
  static forRoot(_options: AdaptersModuleOptions = {}): DynamicModule {
    return {
      module: AdaptersModule,
      global: true,
      providers: [
        ChesEmailTransport,
        NodemailerEmailTransport,
        TwilioSmsTransport,
        {
          provide: EMAIL_ADAPTER_MAP,
          useFactory: (
            ches: ChesEmailTransport,
            nodemailer: NodemailerEmailTransport,
          ): Record<string, IEmailTransport> => ({
            ches,
            nodemailer,
          }),
          inject: [ChesEmailTransport, NodemailerEmailTransport],
        },
        {
          provide: SMS_ADAPTER_MAP,
          useFactory: (
            twilio: TwilioSmsTransport,
          ): Record<string, ISmsTransport> => ({
            twilio,
          }),
          inject: [TwilioSmsTransport],
        },
        {
          provide: EMAIL_ADAPTER,
          useFactory: (
            map: Record<string, IEmailTransport>,
            configService: ConfigService,
          ): IEmailTransport => {
            const key =
              configService.get<string>('delivery.email') ?? 'nodemailer';
            // Passthrough keys use GcNotifyApiClient/ChesPassthroughClient, not IEmailTransport; fallback for DI
            if (key?.includes(':passthrough')) {
              return map['nodemailer'] ?? map['ches'];
            }
            const provider = key?.includes(':') ? key.split(':')[0] : key;
            return map[provider] ?? map['nodemailer'] ?? map['ches'];
          },
          inject: [EMAIL_ADAPTER_MAP, ConfigService],
        },
        {
          provide: SMS_ADAPTER,
          useFactory: (
            map: Record<string, ISmsTransport>,
            configService: ConfigService,
          ): ISmsTransport => {
            const key = configService.get<string>('delivery.sms') ?? 'twilio';
            // Passthrough keys use GcNotifyApiClient, not ISmsTransport; fallback for DI
            if (key?.includes(':passthrough')) {
              return map['twilio'];
            }
            const provider = key?.includes(':') ? key.split(':')[0] : key;
            return map[provider] ?? map['twilio'];
          },
          inject: [SMS_ADAPTER_MAP, ConfigService],
        },
        InMemoryTemplateStore,
        { provide: SENDER_STORE, useClass: InMemorySenderStore },
      ],
      exports: [
        EMAIL_ADAPTER,
        SMS_ADAPTER,
        EMAIL_ADAPTER_MAP,
        SMS_ADAPTER_MAP,
        InMemoryTemplateStore,
        SENDER_STORE,
      ],
    };
  }
}
