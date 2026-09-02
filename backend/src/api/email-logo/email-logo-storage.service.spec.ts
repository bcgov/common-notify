import { vi } from 'vitest'
import { AttachmentStorage } from '../attachment/attachment-storage.interface'
import { EmailLogoStorageService } from './email-logo-storage.service'

describe('EmailLogoStorageService', () => {
  const attachmentStorage: AttachmentStorage = {
    upload: vi.fn(),
    head: vi.fn(),
    download: vi.fn(),
    delete: vi.fn(),
  }
  const service = new EmailLogoStorageService(attachmentStorage)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uploads a bare filename under the reserved logos prefix', async () => {
    vi.mocked(attachmentStorage.upload).mockResolvedValue({
      storageKey: 'logos/logo.png',
      sizeBytes: 3,
      contentSha256: 'hash',
    })
    const content = Buffer.from('png')

    await service.upload({ storageKey: 'logo.png', content, mimeType: 'image/png' })

    expect(attachmentStorage.upload).toHaveBeenCalledWith({
      storageKey: 'logos/logo.png',
      content,
      mimeType: 'image/png',
    })
  })

  it('does not duplicate an existing logos prefix', async () => {
    vi.mocked(attachmentStorage.upload).mockResolvedValue({
      storageKey: 'logos/logo.png',
      sizeBytes: 3,
      contentSha256: 'hash',
    })

    await service.upload({
      storageKey: 'logos/logo.png',
      content: Buffer.from('png'),
      mimeType: 'image/png',
    })

    expect(attachmentStorage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ storageKey: 'logos/logo.png' }),
    )
  })

  it('prefixes metadata, download, and delete operations', async () => {
    vi.mocked(attachmentStorage.head).mockResolvedValue(null)
    vi.mocked(attachmentStorage.download).mockResolvedValue(Buffer.from('png'))
    vi.mocked(attachmentStorage.delete).mockResolvedValue()

    await service.head('logo.png')
    await service.download('logo.png')
    await service.delete('logo.png')

    expect(attachmentStorage.head).toHaveBeenCalledWith('logos/logo.png')
    expect(attachmentStorage.download).toHaveBeenCalledWith('logos/logo.png')
    expect(attachmentStorage.delete).toHaveBeenCalledWith('logos/logo.png')
  })
})
