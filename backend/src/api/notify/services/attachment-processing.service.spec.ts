import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { InternalServerErrorException } from '@nestjs/common'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { vi } from 'vitest'
import { AttachmentProcessingService } from './attachment-processing.service'
import { LocalAttachmentStorageService } from './local-attachment-storage.service'
import { NotifySimpleRequest } from '../schemas/notify-simple-request'

describe('AttachmentProcessingService', () => {
  let service: AttachmentProcessingService
  let storageService: LocalAttachmentStorageService
  let tempRootDir: string
  let storageDir: string

  beforeEach(async () => {
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'common-notify-attachments-'))
    storageDir = path.join(tempRootDir, 'nested', 'attachments')

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentProcessingService,
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

    service = module.get<AttachmentProcessingService>(AttachmentProcessingService)
    storageService = module.get<LocalAttachmentStorageService>(LocalAttachmentStorageService)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.rm(tempRootDir, { recursive: true, force: true })
  })

  it('should return the request unchanged when there are no attachments', async () => {
    const request = { email: { recipients: { to: ['test@example.com'] } } } as NotifySimpleRequest

    const result = await service.processAttachments(request)

    expect(result).toEqual(request)
  })

  it('should decode and write an email attachment to local storage', async () => {
    const request = {
      email: {
        recipients: { to: ['test@example.com'] },
        attachments: [
          {
            filename: 'hello.txt',
            mimeType: 'text/plain',
            data: Buffer.from('hello world').toString('base64'),
          },
        ],
      },
    } as NotifySimpleRequest

    const result = await service.processAttachments(request)
    const stored = result.email?.attachments?.[0]
    const storedPath = path.join(storageService.getBaseDirectory(), stored!.storageKey)
    const content = await fs.readFile(storedPath, 'utf8')

    expect(content).toBe('hello world')
    expect(stored?.filename).toBe('hello.txt')
    expect(stored?.mimeType).toBe('text/plain')
    expect(stored?.sizeBytes).toBe(Buffer.byteLength('hello world'))
    expect(stored?.contentSha256).toHaveLength(64)
    expect((stored as any).data).toBeUndefined()
  })

  it('should decode and write an sms attachment to local storage', async () => {
    const request = {
      sms: {
        recipients: { to: ['+15555550123'] },
        attachments: [
          {
            filename: 'sms.txt',
            mimeType: 'text/plain',
            data: Buffer.from('sms body').toString('base64'),
          },
        ],
      },
    } as NotifySimpleRequest

    const result = await service.processAttachments(request)

    expect(result.sms?.attachments?.[0].storageProvider).toBe('local')
  })

  it('should decode and write a msgApp attachment to local storage', async () => {
    const request = {
      msgApp: {
        recipients: { to: ['user-123'] },
        content: { body: 'hello' },
        attachments: [
          {
            filename: 'msg.txt',
            mimeType: 'text/plain',
            data: Buffer.from('msg body').toString('base64'),
          },
        ],
      },
    } as NotifySimpleRequest

    const result = await service.processAttachments(request)

    expect(result.msgApp?.attachments?.[0].storageProvider).toBe('local')
  })

  it('should replace raw base64 data before the payload is stored', async () => {
    const request = {
      email: {
        recipients: { to: ['test@example.com'] },
        attachments: [
          {
            filename: 'hello.txt',
            mimeType: 'text/plain',
            data: Buffer.from('hello world').toString('base64'),
          },
        ],
      },
    } as NotifySimpleRequest

    const result = await service.processAttachments(request)
    const stored = result.email?.attachments?.[0] as any

    expect(stored.storageKey).toBeDefined()
    expect(stored.data).toBeUndefined()
  })

  it('should generate storage names that do not use the user filename directly', async () => {
    const request = {
      email: {
        recipients: { to: ['test@example.com'] },
        attachments: [
          {
            filename: 'secret-name.txt',
            mimeType: 'text/plain',
            data: Buffer.from('hello world').toString('base64'),
          },
        ],
      },
    } as NotifySimpleRequest

    const result = await service.processAttachments(request)
    const stored = result.email?.attachments?.[0]

    expect(stored?.storageKey).not.toContain('secret-name.txt')
  })

  it('should create the storage directory if it is missing', async () => {
    const request = {
      email: {
        recipients: { to: ['test@example.com'] },
        attachments: [
          {
            filename: 'hello.txt',
            mimeType: 'text/plain',
            data: Buffer.from('hello world').toString('base64'),
          },
        ],
      },
    } as NotifySimpleRequest

    await service.processAttachments(request)

    await expect(fs.access(storageDir)).resolves.toBeUndefined()
  })

  it('should record the correct content hash and size', async () => {
    const data = 'hash me'
    const request = {
      email: {
        recipients: { to: ['test@example.com'] },
        attachments: [
          {
            filename: 'hash.txt',
            mimeType: 'text/plain',
            data: Buffer.from(data).toString('base64'),
          },
        ],
      },
    } as NotifySimpleRequest

    const result = await service.processAttachments(request)
    const stored = result.email?.attachments?.[0]

    expect(stored?.sizeBytes).toBe(Buffer.byteLength(data))
    expect(stored?.contentSha256).toHaveLength(64)
  })

  it('should throw a safe server exception when storage fails', async () => {
    const request = {
      email: {
        recipients: { to: ['test@example.com'] },
        attachments: [
          {
            filename: 'hello.txt',
            mimeType: 'text/plain',
            data: Buffer.from('secret payload').toString('base64'),
          },
        ],
      },
    } as NotifySimpleRequest

    vi.spyOn(storageService, 'storeAttachment').mockRejectedValueOnce(
      new InternalServerErrorException('Failed to store attachment file'),
    )

    await expect(service.processAttachments(request)).rejects.toThrow(InternalServerErrorException)
  })
})
