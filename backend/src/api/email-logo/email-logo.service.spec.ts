import { Test, TestingModule } from '@nestjs/testing'
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailLogoService, { provide: EmailLogoRepository, useValue: repository }],
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
})
