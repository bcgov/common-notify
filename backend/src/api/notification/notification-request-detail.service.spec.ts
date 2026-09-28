import { Test, TestingModule } from '@nestjs/testing'
import type { FindOperator } from 'typeorm'
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
    update: vi.fn().mockResolvedValue(undefined),
    increment: vi.fn().mockResolvedValue(undefined),
    find: vi.fn().mockResolvedValue([]),
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
    detailRepository.find.mockResolvedValue([])
  })

  /** Unwrap Not(In([...])) down to the status list it excludes. */
  function excludedStatuses(where: Record<string, unknown>): unknown {
    const notOperator = where.status as FindOperator<string>
    expect(notOperator?.type).toBe('not')
    expect(notOperator.child?.type).toBe('in')
    // TypeORM's `value` getter already recurses through the nested operator.
    return notOperator.value
  }

  describe('retry protection', () => {
    // A redelivered job must not reach a recipient twice. Three pieces have to agree: the rows
    // survive resetForRetry, the SENDING transition does not rewrite them, and the send list is
    // filtered against them.
    it('resetForRetry leaves delivered and blocked rows alone', async () => {
      await service.resetForRetry('request-1')

      const [incrementWhere] = detailRepository.increment.mock.calls[0]
      const [updateWhere, updateValues] = detailRepository.update.mock.calls[0]

      expect(excludedStatuses(incrementWhere)).toEqual(['sent', 'blocked'])
      expect(excludedStatuses(updateWhere)).toEqual(['sent', 'blocked'])
      expect(updateValues).toMatchObject({ status: 'pending' })
    })

    it('updateStatus rewrites every row by default', async () => {
      await service.updateStatus('request-1', 'processing')

      const [where] = detailRepository.update.mock.calls[0]
      expect(where).toEqual({ notificationRequestId: 'request-1' })
    })

    it('updateStatus with preserveCompleted skips delivered and blocked rows', async () => {
      await service.updateStatus('request-1', 'sending', { preserveCompleted: true })

      const [where, values] = detailRepository.update.mock.calls[0]
      expect(where.notificationRequestId).toBe('request-1')
      expect(excludedStatuses(where)).toEqual(['sent', 'blocked'])
      expect(values).toMatchObject({ status: 'sending' })
    })

    it('findSentAddresses returns the addresses a previous attempt delivered', async () => {
      detailRepository.find.mockResolvedValue([
        { recipientAddress: '+12505550101' },
        { recipientAddress: '+12505550102' },
      ])

      const sent = await service.findSentAddresses('request-1', 'batch-1')

      const [options] = detailRepository.find.mock.calls[0]
      expect(options.where).toMatchObject({
        notificationRequestId: 'request-1',
        status: 'sent',
        batchId: 'batch-1',
      })
      expect(sent).toEqual(new Set(['+12505550101', '+12505550102']))
    })

    it('findSentAddresses does not filter on batch for a non-merge send', async () => {
      await service.findSentAddresses('request-1')

      const [options] = detailRepository.find.mock.calls[0]
      expect(options.where).not.toHaveProperty('batchId')
    })
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
