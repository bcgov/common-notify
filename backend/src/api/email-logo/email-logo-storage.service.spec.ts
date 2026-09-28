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
      storageKey: 'logos/BC_AG_H_RGB_pos.svg',
      sizeBytes: 3,
      contentSha256: 'hash',
    })
    const content = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>',
    )

    await service.upload({ storageKey: 'BC_AG_H_RGB_pos.svg', content, mimeType: 'image/svg+xml' })

    expect(attachmentStorage.upload).toHaveBeenCalledWith({
      storageKey: 'logos/BC_AG_H_RGB_pos.svg',
      content,
      mimeType: 'image/svg+xml',
    })
  })

  it('does not duplicate an existing logos prefix', async () => {
    vi.mocked(attachmentStorage.upload).mockResolvedValue({
      storageKey: 'logos/BC_AG_H_RGB_pos.svg',
      sizeBytes: 3,
      contentSha256: 'hash',
    })

    await service.upload({
      storageKey: 'logos/BC_AG_H_RGB_pos.svg',
      content: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>',
      ),
      mimeType: 'image/svg+xml',
    })

    expect(attachmentStorage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ storageKey: 'logos/BC_AG_H_RGB_pos.svg' }),
    )
  })

  it('prefixes metadata, download, and delete operations', async () => {
    const content = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')
    const metadata = { contentType: 'image/svg+xml', contentLength: content.length }
    vi.mocked(attachmentStorage.head).mockResolvedValue(metadata)
    vi.mocked(attachmentStorage.download).mockResolvedValue(content)
    vi.mocked(attachmentStorage.delete).mockResolvedValue()

    await expect(service.head('BC_AG_H_RGB_pos.svg')).resolves.toBe(metadata)
    await expect(service.download('BC_AG_H_RGB_pos.svg')).resolves.toBe(content)
    await service.delete('BC_AG_H_RGB_pos.svg')

    expect(attachmentStorage.head).toHaveBeenCalledWith('logos/BC_AG_H_RGB_pos.svg')
    expect(attachmentStorage.download).toHaveBeenCalledWith('logos/BC_AG_H_RGB_pos.svg')
    expect(attachmentStorage.delete).toHaveBeenCalledWith('logos/BC_AG_H_RGB_pos.svg')
  })

  it('preserves missing-object metadata and download errors', async () => {
    const error = new Error('Object not found')
    vi.mocked(attachmentStorage.head).mockResolvedValue(null)
    vi.mocked(attachmentStorage.download).mockRejectedValue(error)

    await expect(service.head('logos/BC_AG_H_RGB_pos.svg')).resolves.toBeNull()
    await expect(service.download('logos/BC_AG_H_RGB_pos.svg')).rejects.toBe(error)
  })
})
