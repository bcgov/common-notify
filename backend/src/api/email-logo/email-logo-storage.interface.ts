export interface EmailLogoUploadInput {
  storageKey: string
  content: Buffer
  mimeType: string
}

export interface EmailLogoUploadResult {
  storageKey: string
  sizeBytes: number
  contentSha256: string
}

export interface EmailLogoHeadResult {
  contentLength?: number
  contentType?: string
  eTag?: string
  lastModified?: Date
}

export interface EmailLogoStorage {
  upload(input: EmailLogoUploadInput): Promise<EmailLogoUploadResult>
  head(storageKey: string): Promise<EmailLogoHeadResult | null>
  download(storageKey: string): Promise<Buffer>
  delete(storageKey: string): Promise<void>
}
