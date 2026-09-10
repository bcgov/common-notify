import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { vi } from 'vitest'
import { EmailLogo } from '../tenant-settings/entities/email-logo.entity'
import { EmailLogoRepository } from './email-logo.repository'

describe('EmailLogoRepository', () => {
  let repository: EmailLogoRepository

  const approvedLogo: EmailLogo = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'BC Gov Logo Primary',
    fileKey: 'logos/bc-gov-logo-primary.png',
    sourceCode: 'SYSTEM',
    statusCode: 'APPROVED',
    tenantId: null,
    submittedBy: null,
    approvedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  }

  const mockRepo = {
    find: vi.fn(),
    findOne: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailLogoRepository,
        {
          provide: getRepositoryToken(EmailLogo),
          useValue: mockRepo,
        },
      ],
    }).compile()

    repository = module.get(EmailLogoRepository)
    vi.clearAllMocks()
  })

  it('finds only approved, non-deleted logos', async () => {
    mockRepo.find.mockResolvedValue([approvedLogo])

    await expect(repository.findApproved()).resolves.toEqual([approvedLogo])
    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { statusCode: 'APPROVED', isDeleted: false },
    })
  })

  it('finds an id only when it is approved and not deleted', async () => {
    mockRepo.findOne.mockResolvedValue(approvedLogo)

    await expect(repository.findByIdIfApproved(approvedLogo.id)).resolves.toEqual(approvedLogo)
    expect(mockRepo.findOne).toHaveBeenCalledWith({
      where: {
        id: approvedLogo.id,
        statusCode: 'APPROVED',
        isDeleted: false,
      },
    })
  })

  it('returns null when no approved, non-deleted logo matches', async () => {
    mockRepo.findOne.mockResolvedValue(null)

    await expect(repository.findByIdIfApproved('missing')).resolves.toBeNull()
  })
})
