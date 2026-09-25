import { NotFoundException } from '@nestjs/common'
import { HEADERS_METADATA } from '@nestjs/common/constants'
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator'
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

  it('keeps public access, immutable caching, and cross-origin image access', () => {
    const handler = EmailLogoController.prototype.getImage
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true)
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual(
      expect.arrayContaining([
        { name: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        { name: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
      ]),
    )
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(response.type).mockReturnValue(response)
  })

  it('serves an approved logo using object storage content type metadata', async () => {
    const logo = {
      id: 'logo-id',
      name: 'Attorney General (AG)',
      fileKey: 'logos/BC_AG_H_RGB_pos.svg',
      sourceCode: 'SYSTEM',
      statusCode: 'APPROVED',
      isDeleted: false,
    } as EmailLogo
    const content = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>',
    )
    vi.mocked(emailLogoService.findByIdIfApproved).mockResolvedValue(logo)
    vi.mocked(emailLogoStorage.head).mockResolvedValue({ contentType: 'image/svg+xml' })
    vi.mocked(emailLogoStorage.download).mockResolvedValue(content)

    await controller.getImage('logo-id', response)

    expect(emailLogoService.findByIdIfApproved).toHaveBeenCalledWith('logo-id')
    expect(emailLogoStorage.head).toHaveBeenCalledWith('logos/BC_AG_H_RGB_pos.svg')
    expect(emailLogoStorage.download).toHaveBeenCalledWith('logos/BC_AG_H_RGB_pos.svg')
    expect(response.type).toHaveBeenCalledWith('image/svg+xml')
    expect(response.send).toHaveBeenCalledWith(content)
    expect(vi.mocked(response.send).mock.calls[0][0]).toBe(content)
  })

  it('derives the content type from the file extension when metadata omits it', async () => {
    vi.mocked(emailLogoService.findByIdIfApproved).mockResolvedValue({
      id: 'logo-id',
      fileKey: 'logos/BC_AG_H_RGB_pos.svg',
    } as EmailLogo)
    vi.mocked(emailLogoStorage.head).mockResolvedValue({})
    vi.mocked(emailLogoStorage.download).mockResolvedValue(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>',
      ),
    )

    await controller.getImage('logo-id', response)

    expect(response.type).toHaveBeenCalledWith('image/svg+xml')
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
