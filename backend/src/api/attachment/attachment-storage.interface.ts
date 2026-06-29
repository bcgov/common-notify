export interface UploadInput {
  storageKey: string
  content: Buffer
  mimeType: string
}

export interface UploadResult {
  storageKey: string
  sizeBytes: number
  contentSha256: string
}

export interface HeadResult {
  contentLength?: number
  contentType?: string
  eTag?: string
  lastModified?: Date
}

export interface AttachmentStorage {
  upload(input: UploadInput): Promise<UploadResult>
  head(storageKey: string): Promise<HeadResult | null>
  download(storageKey: string): Promise<Buffer>
  delete(storageKey: string): Promise<void>
}
