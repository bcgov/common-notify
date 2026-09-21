import { ConfigService } from '@nestjs/config'
import { readdir } from 'fs/promises'
import * as path from 'path'
import { vi } from 'vitest'
import { ClamavService } from '../../services/clamav.service'
import { EmailLogoBootstrapService } from './email-logo-bootstrap.service'
import { EMAIL_LOGO_PNG_WIDTH, SYSTEM_EMAIL_LOGO_KEYS } from './email-logo.constants'
import { EmailLogoStorage } from './email-logo-storage.interface'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

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

  it('uploads all 23 approved SVG assets and a rendered PNG of each', async () => {
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
    expect(storage.head).toHaveBeenCalledTimes(46)
    expect(storage.upload).toHaveBeenCalledTimes(46)

    const scanCalls = vi.mocked(clamavService.scanBuffer).mock.calls
    const uploadCalls = vi.mocked(storage.upload).mock.calls
    for (const [index, storageKey] of SYSTEM_EMAIL_LOGO_KEYS.entries()) {
      const filename = path.posix.basename(storageKey)
      const imageKey = storageKey.replace(/\.svg$/, `-${EMAIL_LOGO_PNG_WIDTH}w.png`)
      const [scannedContent, scannedFilename] = scanCalls[index]
      const [svgUpload] = uploadCalls[index * 2]
      const [pngUpload] = uploadCalls[index * 2 + 1]

      expect(storageKey).toMatch(/^logos\/BC_[A-Z]+_H_RGB_pos\.svg$/)
      expect(storage.head).toHaveBeenCalledWith(storageKey)
      expect(storage.head).toHaveBeenCalledWith(imageKey)
      expect(scannedFilename).toBe(filename)
      expect(Buffer.isBuffer(scannedContent)).toBe(true)
      expect(scannedContent.byteLength).toBeGreaterThan(0)
      expect(svgUpload).toMatchObject({ storageKey, mimeType: 'image/svg+xml' })
      expect(svgUpload.content).toBe(scannedContent)
      expect(pngUpload).toMatchObject({ storageKey: imageKey, mimeType: 'image/png' })
      expect(pngUpload.content.subarray(0, 8)).toEqual(PNG_SIGNATURE)
      expect(pngUpload.content.readUInt32BE(16)).toBe(EMAIL_LOGO_PNG_WIDTH)
    }
  }, 30_000)

  it('skips logos whose SVG and PNG both already exist', async () => {
    vi.mocked(storage.head).mockResolvedValue({ contentLength: 1 })

    await new EmailLogoBootstrapService(config, storage, clamavService).onModuleInit()

    expect(clamavService.scanBuffer).not.toHaveBeenCalled()
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('renders only the missing PNG when the SVG is already stored', async () => {
    vi.mocked(storage.head).mockImplementation(async (storageKey) =>
      storageKey.endsWith('.svg') ? { contentLength: 1 } : null,
    )

    await new EmailLogoBootstrapService(config, storage, clamavService).onModuleInit()

    expect(clamavService.scanBuffer).toHaveBeenCalledTimes(23)
    expect(storage.upload).toHaveBeenCalledTimes(23)
    for (const [uploadInput] of vi.mocked(storage.upload).mock.calls) {
      expect(uploadInput).toMatchObject({ mimeType: 'image/png' })
      expect(uploadInput.storageKey).toMatch(/-\d+w\.png$/)
    }
  }, 30_000)

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
