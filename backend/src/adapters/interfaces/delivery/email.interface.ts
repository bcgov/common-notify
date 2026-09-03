export interface SendEmailOptions {
  to: string | string[]
  subject: string
  body: string
  from?: string
  replyTo?: string
  // bodyType determines how adapter should handle the body content:
  // 'text': send as plain text
  // 'markdown': adapter should convert markdown to HTML
  // 'html': send as HTML (assumed already formatted)
  bodyType?: 'text' | 'markdown' | 'html'
  attachments?: Array<{
    filename: string
    content: Buffer | string
    contentType?: string
    sendingMethod: 'attach' | 'link'
    contentId?: string
    disposition?: 'inline' | 'attachment'
  }>
}

export interface SendEmailResult {
  messageId?: string
  providerResponse?: string
}

export interface IEmailTransport {
  readonly name: string
  send(options: SendEmailOptions): Promise<SendEmailResult>
}
