import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { vi } from 'vitest'
import { NotificationRequestDetailService } from './notification-request-detail.service'
import { NotificationRequestDetail } from './entities/notification-request-detail.entity'
import { TenantsService } from '../admin/tenants/tenants.service'

describe('NotificationRequestDetailService', () => {
  let service: NotificationRequestDetailService

  const detailRepository = {
    create: vi.fn((entity) => entity),
    save: vi.fn().mockResolvedValue(undefined),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationRequestDetailService,
        { provide: getRepositoryToken(NotificationRequestDetail), useValue: detailRepository },
        { provide: TenantsService, useValue: {} },
      ],
    }).compile()

    service = module.get<NotificationRequestDetailService>(NotificationRequestDetailService)
    vi.clearAllMocks()
    detailRepository.create.mockImplementation((entity) => entity)
  })

  describe('createBlocked', () => {
    it('records one row per blocked recipient with the reason', async () => {
      await service.createBlocked(
        'request-1',
        [
          { address: 'a@gov.bc.ca', channel: 'EMAIL' },
          { address: 'b@gov.bc.ca', channel: 'EMAIL' },
        ],
        'Recipient is not on the tenant safelist',
        'tenant-1',
      )

      const [saved] = detailRepository.save.mock.calls[0]
      expect(saved).toHaveLength(2)
      expect(saved[0]).toMatchObject({
        notificationRequestId: 'request-1',
        recipientAddress: 'a@gov.bc.ca',
        channel: 'EMAIL',
        status: 'blocked',
        attemptCount: 0,
        errorMessage: 'Recipient is not on the tenant safelist',
      })
    })

    it('collapses a repeated recipient so the unique constraint cannot fail the whole insert', async () => {
      await service.createBlocked(
        'request-1',
        [
          { address: 'a@gov.bc.ca', channel: 'EMAIL' },
          { address: 'a@gov.bc.ca', channel: 'EMAIL' },
          { address: 'b@gov.bc.ca', channel: 'EMAIL' },
        ],
        'blocked',
      )

      const [saved] = detailRepository.save.mock.calls[0]
      expect(saved.map((row: NotificationRequestDetail) => row.recipientAddress)).toEqual([
        'a@gov.bc.ca',
        'b@gov.bc.ca',
      ])
    })

    it('keeps the same address on different channels — the constraint spans both columns', async () => {
      await service.createBlocked(
        'request-1',
        [
          { address: '+12505550100', channel: 'SMS' },
          { address: '+12505550100', channel: 'EMAIL' },
        ],
        'blocked',
      )

      const [saved] = detailRepository.save.mock.calls[0]
      expect(saved).toHaveLength(2)
    })

    it('does not touch the database when nothing was blocked', async () => {
      await service.createBlocked('request-1', [], 'blocked')

      expect(detailRepository.save).not.toHaveBeenCalled()
    })
  })
})
