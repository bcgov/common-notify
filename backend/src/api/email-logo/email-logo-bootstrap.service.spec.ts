import { ConfigService } from '@nestjs/config'
import { readFile, readdir } from 'fs/promises'
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

  it('uploads every configured checked-in PNG under its seeded database key', async () => {
    vi.mocked(storage.head).mockResolvedValue(null)
    vi.mocked(storage.upload).mockImplementation(async (input) => ({
      storageKey: input.storageKey,
      sizeBytes: input.content.byteLength,
      contentSha256: 'hash',
    }))

    await new EmailLogoBootstrapService(config, storage, clamavService).onModuleInit()

    const checkedInFilenames = (await readdir(assetDirectory))
      .filter((filename) => filename.endsWith('.png'))
      .sort()
    const configuredFilenames = SYSTEM_EMAIL_LOGO_KEYS.map((storageKey) =>
      path.posix.basename(storageKey),
    ).sort()

    expect(configuredFilenames).toEqual(checkedInFilenames)
    expect(storage.upload).toHaveBeenCalledTimes(SYSTEM_EMAIL_LOGO_KEYS.length)
    for (const storageKey of SYSTEM_EMAIL_LOGO_KEYS) {
      const filename = path.posix.basename(storageKey)
      const expectedContent = await readFile(path.join(assetDirectory, filename))
      expect(clamavService.scanBuffer).toHaveBeenCalledWith(expectedContent, filename)
      expect(storage.upload).toHaveBeenCalledWith({
        storageKey,
        content: expectedContent,
        mimeType: 'image/png',
      })
    }
  })

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
