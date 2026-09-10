import { Inject, Injectable } from '@nestjs/common'
import { ATTACHMENT_STORAGE } from '../attachment/attachment.constants'
import { AttachmentStorage } from '../attachment/attachment-storage.interface'
import { EMAIL_LOGO_STORAGE_PREFIX } from './email-logo.constants'
import {
  EmailLogoHeadResult,
  EmailLogoStorage,
  EmailLogoUploadInput,
  EmailLogoUploadResult,
} from './email-logo-storage.interface'

@Injectable()
export class EmailLogoStorageService implements EmailLogoStorage {
  constructor(@Inject(ATTACHMENT_STORAGE) private readonly attachmentStorage: AttachmentStorage) {}

  upload(input: EmailLogoUploadInput): Promise<EmailLogoUploadResult> {
    return this.attachmentStorage.upload({
      ...input,
      storageKey: this.toLogoStorageKey(input.storageKey),
    })
  }

  head(storageKey: string): Promise<EmailLogoHeadResult | null> {
    return this.attachmentStorage.head(this.toLogoStorageKey(storageKey))
  }

  download(storageKey: string): Promise<Buffer> {
    return this.attachmentStorage.download(this.toLogoStorageKey(storageKey))
  }

  delete(storageKey: string): Promise<void> {
    return this.attachmentStorage.delete(this.toLogoStorageKey(storageKey))
  }

  private toLogoStorageKey(storageKey: string): string {
    return storageKey.startsWith(EMAIL_LOGO_STORAGE_PREFIX)
      ? storageKey
      : `${EMAIL_LOGO_STORAGE_PREFIX}${storageKey}`
  }
}
