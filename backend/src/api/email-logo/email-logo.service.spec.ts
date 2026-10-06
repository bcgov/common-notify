import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { vi } from 'vitest'
import { EmailLogo } from '../tenant-settings/entities/email-logo.entity'
import { EmailLogoRepository } from './email-logo.repository'
import { EmailLogoService } from './email-logo.service'

describe('EmailLogoService', () => {
  let service: EmailLogoService

  const repository = {
    findApproved: vi.fn(),
    findByIdIfApproved: vi.fn(),
  }
  const configService = {
    get: vi.fn((key: string) => {
      const values: Record<string, string> = {
        'emailLogo.publicBaseUrl': 'https://gateway.example.test/',
        'emailLogo.publicPathPrefix': '',
      }
      return values[key]
    }),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailLogoService,
        { provide: EmailLogoRepository, useValue: repository },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile()

    service = module.get(EmailLogoService)
    vi.clearAllMocks()
  })

  it('returns approved logos from the repository', async () => {
    const logos = [{ id: 'logo-id' }] as EmailLogo[]
    repository.findApproved.mockResolvedValue(logos)

    await expect(service.findApproved()).resolves.toBe(logos)
  })

  it('returns an approved logo by id from the repository', async () => {
    const logo = { id: 'logo-id' } as EmailLogo
    repository.findByIdIfApproved.mockResolvedValue(logo)

    await expect(service.findByIdIfApproved('logo-id')).resolves.toBe(logo)
    expect(repository.findByIdIfApproved).toHaveBeenCalledWith('logo-id')
  })

  it('passes through null for an unavailable logo', async () => {
    repository.findByIdIfApproved.mockResolvedValue(null)

    await expect(service.findByIdIfApproved('unavailable')).resolves.toBeNull()
  })

  it('resolves the default using its flag rather than its name', async () => {
    repository.findApproved.mockResolvedValue([
      { id: 'default-id', name: 'Renamed mark', isDefault: true },
    ])
    await expect(service.getDefault()).resolves.toMatchObject({ id: 'default-id' })
  })

  it('fails rather than sending unbranded email when no default is configured', async () => {
    repository.findApproved.mockResolvedValue([])
    await expect(service.getDefault()).rejects.toThrow('Default email logo is not configured')
  })

  it('builds an image URL against the public API gateway', () => {
    expect(service.buildPublicImageUrl('logo-id')).toBe(
      'https://gateway.example.test/logos/logo-id/image',
    )
  })

  it('includes the configured gateway path prefix for PR deployments', () => {
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        'emailLogo.publicBaseUrl': 'https://gateway.example.test',
        'emailLogo.publicPathPrefix': '/pr-123/',
      }
      return values[key]
    })

    expect(service.buildPublicImageUrl('logo-id')).toBe(
      'https://gateway.example.test/pr-123/logos/logo-id/image',
    )
  })
})
