export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    sendingMethod: 'attach' | 'link';
  }>;
}

export interface SendEmailResult {
  messageId?: string;
  providerResponse?: string;
}

export interface IEmailTransport {
  readonly name: string;
  send(options: SendEmailOptions): Promise<SendEmailResult>;
}
