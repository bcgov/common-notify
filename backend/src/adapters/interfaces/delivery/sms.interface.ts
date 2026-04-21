export interface SendSmsOptions {
  to: string;
  body: string;
  from?: string;
}

export interface SendSmsResult {
  messageId?: string;
  providerResponse?: string;
}

export interface ISmsTransport {
  readonly name: string;
  send(options: SendSmsOptions): Promise<SendSmsResult>;
}
