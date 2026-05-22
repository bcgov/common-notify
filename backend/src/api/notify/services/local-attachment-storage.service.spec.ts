import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { InternalServerErrorException, Logger } from '@nestjs/common'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { vi } from 'vitest'
import { LocalAttachmentStorageService } from './local-attachment-storage.service'

describe('LocalAttachmentStorageService', () => {
  let service: LocalAttachmentStorageService
  let tempRootDir: string

  beforeEach(async () => {
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'common-notify-storage-'))
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.rm(tempRootDir, { recursive: true, force: true })
  })

  it('should throw a safe server exception when file storage fails without logging raw data', async () => {
    const storageDir = path.join(tempRootDir, 'not-a-directory')
    const rawContent = Buffer.from('secret payload')
    const loggerSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})

    await fs.writeFile(storageDir, 'file-blocker')

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalAttachmentStorageService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              if (key === 'attachments.storageDir') return storageDir
              return undefined
            }),
          },
        },
      ],
    }).compile()

    service = module.get<LocalAttachmentStorageService>(LocalAttachmentStorageService)

    await expect(
      service.storeAttachment({
        filename: 'hello.txt',
        mimeType: 'text/plain',
        content: rawContent,
      }),
    ).rejects.toThrow(InternalServerErrorException)

    expect(loggerSpy).toHaveBeenCalled()
    expect(JSON.stringify(loggerSpy.mock.calls)).not.toContain(rawContent.toString('base64'))
    expect(JSON.stringify(loggerSpy.mock.calls)).not.toContain(rawContent.toString('utf8'))
  })

  it('should read a stored attachment from local storage', async () => {
    const storageDir = path.join(tempRootDir, 'attachments')

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalAttachmentStorageService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              if (key === 'attachments.storageDir') return storageDir
              return undefined
            }),
          },
        },
      ],
    }).compile()

    service = module.get<LocalAttachmentStorageService>(LocalAttachmentStorageService)
    const stored = await service.storeAttachment({
      filename: 'hello.txt',
      mimeType: 'text/plain',
      content: Buffer.from('hello world'),
    })

    const content = await service.readAttachment(stored.storageKey, stored.contentSha256)

    expect(content.toString('utf8')).toBe('hello world')
  })

  it('should throw when stored attachment hash verification fails', async () => {
    const storageDir = path.join(tempRootDir, 'attachments')

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalAttachmentStorageService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              if (key === 'attachments.storageDir') return storageDir
              return undefined
            }),
          },
        },
      ],
    }).compile()

    service = module.get<LocalAttachmentStorageService>(LocalAttachmentStorageService)
    const stored = await service.storeAttachment({
      filename: 'hello.txt',
      mimeType: 'text/plain',
      content: Buffer.from('hello world'),
    })

    await fs.writeFile(path.join(storageDir, stored.storageKey), 'tampered')

    await expect(service.readAttachment(stored.storageKey, stored.contentSha256)).rejects.toThrow(
      InternalServerErrorException,
    )
  })
})
