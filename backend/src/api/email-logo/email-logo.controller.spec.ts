import { NotFoundException } from '@nestjs/common'
import type { Response } from 'express'
import { vi } from 'vitest'
import { EmailLogo } from '../tenant-settings/entities/email-logo.entity'
import { EmailLogoController } from './email-logo.controller'
import { EmailLogoService } from './email-logo.service'
import { EmailLogoStorageService } from './email-logo-storage.service'

describe('EmailLogoController', () => {
  const emailLogoService = {
    findByIdIfApproved: vi.fn(),
  } as unknown as EmailLogoService
  const emailLogoStorage = {
    head: vi.fn(),
    download: vi.fn(),
  } as unknown as EmailLogoStorageService
  const response = {
    type: vi.fn(),
    send: vi.fn(),
  } as unknown as Response
  const controller = new EmailLogoController(emailLogoService, emailLogoStorage)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(response.type).mockReturnValue(response)
  })

  it('serves an approved logo using object storage content type metadata', async () => {
    const logo = { id: 'logo-id', fileKey: 'logos/logo.png' } as EmailLogo
    const content = Buffer.from('png')
    vi.mocked(emailLogoService.findByIdIfApproved).mockResolvedValue(logo)
    vi.mocked(emailLogoStorage.head).mockResolvedValue({ contentType: 'image/png' })
    vi.mocked(emailLogoStorage.download).mockResolvedValue(content)

    await controller.getImage('logo-id', response)

    expect(emailLogoService.findByIdIfApproved).toHaveBeenCalledWith('logo-id')
    expect(emailLogoStorage.head).toHaveBeenCalledWith('logos/logo.png')
    expect(emailLogoStorage.download).toHaveBeenCalledWith('logos/logo.png')
    expect(response.type).toHaveBeenCalledWith('image/png')
    expect(response.send).toHaveBeenCalledWith(content)
  })

  it('derives the content type from the file extension when metadata omits it', async () => {
    vi.mocked(emailLogoService.findByIdIfApproved).mockResolvedValue({
      id: 'logo-id',
      fileKey: 'logos/logo.png',
    } as EmailLogo)
    vi.mocked(emailLogoStorage.head).mockResolvedValue({})
    vi.mocked(emailLogoStorage.download).mockResolvedValue(Buffer.from('png'))

    await controller.getImage('logo-id', response)

    expect(response.type).toHaveBeenCalledWith('image/png')
  })

  it('returns not found without reading storage when the logo is unavailable', async () => {
    vi.mocked(emailLogoService.findByIdIfApproved).mockResolvedValue(null)

    await expect(controller.getImage('unavailable', response)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(emailLogoStorage.head).not.toHaveBeenCalled()
    expect(emailLogoStorage.download).not.toHaveBeenCalled()
  })
})
