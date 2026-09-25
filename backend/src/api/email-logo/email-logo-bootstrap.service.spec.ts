import { ConfigService } from '@nestjs/config'
import { readdir } from 'fs/promises'
import * as path from 'path'
import { vi } from 'vitest'
import { ClamavService } from '../../services/clamav.service'
import { EmailLogoBootstrapService } from './email-logo-bootstrap.service'
import { SYSTEM_EMAIL_LOGO_KEYS } from './email-logo.constants'
import { EmailLogoStorage } from './email-logo-storage.interface'

describe('EmailLogoBootstrapService', () => {
  const assetDirectory = path.resolve(process.cwd(), '../migrations/assets/email-logos')
  const config = new ConfigService({
    s3: { bucket: 'attachment-test' },
    emailLogo: {
      seedAssetDirectory: assetDirectory,
    },
  })
  const storage: EmailLogoStorage = {
    upload: vi.fn(),
    head: vi.fn(),
    download: vi.fn(),
    delete: vi.fn(),
  }
  const clamavService = {
    scanBuffer: vi.fn().mockResolvedValue({
      isInfected: false,
      viruses: [],
      scannedAt: new Date(),
    }),
  } as unknown as ClamavService

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uploads all 23 approved SVG assets under their configured storage keys', async () => {
    vi.mocked(storage.head).mockResolvedValue(null)
    vi.mocked(storage.upload).mockImplementation(async (input) => ({
      storageKey: input.storageKey,
      sizeBytes: input.content.byteLength,
      contentSha256: 'hash',
    }))

    await new EmailLogoBootstrapService(config, storage, clamavService).onModuleInit()

    const checkedInFilenames = (await readdir(assetDirectory)).sort()
    const configuredFilenames = SYSTEM_EMAIL_LOGO_KEYS.map((storageKey) =>
      path.posix.basename(storageKey),
    ).sort()

    expect(checkedInFilenames).toHaveLength(23)
    expect(new Set(SYSTEM_EMAIL_LOGO_KEYS).size).toBe(23)
    expect(configuredFilenames).toEqual(checkedInFilenames)
    expect(clamavService.scanBuffer).toHaveBeenCalledTimes(23)
    expect(storage.head).toHaveBeenCalledTimes(23)
    expect(storage.upload).toHaveBeenCalledTimes(SYSTEM_EMAIL_LOGO_KEYS.length)

    const scanCalls = vi.mocked(clamavService.scanBuffer).mock.calls
    const uploadCalls = vi.mocked(storage.upload).mock.calls
    for (const [index, storageKey] of SYSTEM_EMAIL_LOGO_KEYS.entries()) {
      const filename = path.posix.basename(storageKey)
      const [scannedContent, scannedFilename] = scanCalls[index]
      const [uploadInput] = uploadCalls[index]

      expect(storageKey).toMatch(/^logos\/BC_[A-Z]+_H_RGB_pos\.svg$/)
      expect(storage.head).toHaveBeenNthCalledWith(index + 1, storageKey)
      expect(scannedFilename).toBe(filename)
      expect(Buffer.isBuffer(scannedContent)).toBe(true)
      expect(scannedContent.byteLength).toBeGreaterThan(0)
      expect(uploadInput).toMatchObject({ storageKey, mimeType: 'image/svg+xml' })
      expect(uploadInput.content).toBe(scannedContent)
    }
  }, 15_000)

  it('skips objects that already exist', async () => {
    vi.mocked(storage.head).mockResolvedValue({ contentLength: 1 })

    await new EmailLogoBootstrapService(config, storage, clamavService).onModuleInit()

    expect(clamavService.scanBuffer).not.toHaveBeenCalled()
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('aborts before upload when a seed file is infected', async () => {
    vi.mocked(storage.head).mockResolvedValue(null)
    vi.mocked(clamavService.scanBuffer).mockResolvedValueOnce({
      isInfected: true,
      viruses: ['Test.Malware'],
      scannedAt: new Date(),
    })

    await expect(
      new EmailLogoBootstrapService(config, storage, clamavService).onModuleInit(),
    ).rejects.toThrow('failed virus scan: Test.Malware')

    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('does nothing when the attachment bucket is not configured', async () => {
    const unconfigured = new ConfigService({
      emailLogo: { seedAssetDirectory: assetDirectory },
    })

    await new EmailLogoBootstrapService(unconfigured, storage, clamavService).onModuleInit()

    expect(storage.head).not.toHaveBeenCalled()
    expect(clamavService.scanBuffer).not.toHaveBeenCalled()
    expect(storage.upload).not.toHaveBeenCalled()
  })
})
