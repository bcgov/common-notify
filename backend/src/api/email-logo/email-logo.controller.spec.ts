import { NotFoundException } from '@nestjs/common'
import type { Request, Response } from 'express'
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
    setHeader: vi.fn(),
    status: vi.fn(),
    end: vi.fn(),
  } as unknown as Response
  const request = { headers: {} } as Request
  const controller = new EmailLogoController(emailLogoService, emailLogoStorage)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(response.type).mockReturnValue(response)
    vi.mocked(response.status).mockReturnValue(response)
  })

  it('serves an approved logo using object storage content type metadata', async () => {
    const logo = { id: 'logo-id', fileKey: 'logos/logo.png' } as EmailLogo
    const content = Buffer.from('png')
    vi.mocked(emailLogoService.findByIdIfApproved).mockResolvedValue(logo)
    const lastModified = new Date('2026-09-01T12:00:00.000Z')
    vi.mocked(emailLogoStorage.head).mockResolvedValue({
      contentType: 'image/png',
      eTag: 'abc123',
      lastModified,
    })
    vi.mocked(emailLogoStorage.download).mockResolvedValue(content)

    await controller.getImage('logo-id', request, response)

    expect(emailLogoService.findByIdIfApproved).toHaveBeenCalledWith('logo-id')
    expect(emailLogoStorage.head).toHaveBeenCalledWith('logos/logo.png')
    expect(emailLogoStorage.download).toHaveBeenCalledWith('logos/logo.png')
    expect(response.setHeader).toHaveBeenCalledWith('ETag', '"abc123"')
    expect(response.setHeader).toHaveBeenCalledWith('Last-Modified', lastModified.toUTCString())
    expect(response.setHeader).toHaveBeenCalledWith('Content-Length', '3')
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

    await controller.getImage('logo-id', request, response)

    expect(response.type).toHaveBeenCalledWith('image/png')
  })

  it('returns not found without reading storage when the logo is unavailable', async () => {
    vi.mocked(emailLogoService.findByIdIfApproved).mockResolvedValue(null)

    await expect(controller.getImage('unavailable', request, response)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(emailLogoStorage.head).not.toHaveBeenCalled()
    expect(emailLogoStorage.download).not.toHaveBeenCalled()
  })

  it('returns 304 without downloading when the ETag matches', async () => {
    vi.mocked(emailLogoService.findByIdIfApproved).mockResolvedValue({
      id: 'logo-id',
      fileKey: 'logos/logo.png',
    } as EmailLogo)
    vi.mocked(emailLogoStorage.head).mockResolvedValue({
      contentType: 'image/png',
      eTag: 'abc123',
    })
    const conditionalRequest = {
      headers: { 'if-none-match': 'W/"abc123"' },
    } as unknown as Request

    await controller.getImage('logo-id', conditionalRequest, response)

    expect(response.status).toHaveBeenCalledWith(304)
    expect(response.end).toHaveBeenCalled()
    expect(emailLogoStorage.download).not.toHaveBeenCalled()
  })

  it('returns not found without downloading when the storage object is unavailable', async () => {
    vi.mocked(emailLogoService.findByIdIfApproved).mockResolvedValue({
      id: 'logo-id',
      fileKey: 'logos/logo.png',
    } as EmailLogo)
    vi.mocked(emailLogoStorage.head).mockResolvedValue(null)

    await expect(controller.getImage('logo-id', request, response)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(emailLogoStorage.download).not.toHaveBeenCalled()
  })
})
