import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import {
  IEmailTransport,
  SendEmailOptions,
  SendEmailResult,
} from '../../../../interfaces';

@Injectable()
export class NodemailerEmailTransport implements IEmailTransport {
  readonly name = 'nodemailer';
  private transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('nodemailer.host', 'localhost');
    const port = this.configService.get<number>('nodemailer.port', 1025);
    const secure = this.configService.get<boolean>('nodemailer.secure', false);
    const user = this.configService.get<string>('nodemailer.user');
    const pass = this.configService.get<string>('nodemailer.pass');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    const attachments: Array<{ filename: string; content: Buffer | string }> =
      options.attachments
        ?.filter((a) => a.sendingMethod === 'attach')
        .map((a) => ({
          filename: a.filename,
          content: a.content,
        })) ?? [];

    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- nodemailer sendMail return type is loosely typed */
    const info = await this.transporter.sendMail({
      from:
        options.from ??
        this.configService.get<string>('nodemailer.from') ??
        this.configService.get<string>(
          'defaults.email.from',
          'noreply@localhost',
        ),
      to: options.to,
      replyTo: options.replyTo,
      subject: options.subject,
      html: options.body,
      attachments,
    });

    return {
      messageId:
        typeof info.messageId === 'string' ? info.messageId : undefined,
      providerResponse:
        typeof info.response === 'string' ? info.response : undefined,
    };
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
  }
}
