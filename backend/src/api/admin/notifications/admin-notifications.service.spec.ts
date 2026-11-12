import { NotFoundException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminNotificationsService } from './admin-notifications.service'
import { fakeQueryBuilder } from '../../../common/query/test-utils/fake-query-builder'

const request = {
  id: 'req-1',
  tenantId: 't-1',
  tenant: { id: 't-1', name: 'Parks' },
  status: 'failed',
  statusCode: { code: 'failed', displayName: 'Failed' },
  channelCodes: ['EMAIL'],
  requestRoute: 'notifysimple',
  createdAt: new Date('2026-11-10T10:00:00.000Z'),
  updatedAt: new Date('2026-11-10T10:05:00.000Z'),
  delayedSendTime: undefined,
}

describe('AdminNotificationsService', () => {
  let requestQb: ReturnType<typeof fakeQueryBuilder>
  let detailQb: ReturnType<typeof fakeQueryBuilder>
  let requestQuery: ReturnType<typeof vi.fn>
  let service: AdminNotificationsService

  function build(requestResult: Parameters<typeof fakeQueryBuilder>[0], detailResult = {}) {
    requestQb = fakeQueryBuilder(requestResult)
    detailQb = fakeQueryBuilder(detailResult)
    service = new AdminNotificationsService(
      { createQueryBuilder: () => requestQb.qb, query: requestQuery } as never,
      { createQueryBuilder: () => detailQb.qb } as never,
    )
  }

  beforeEach(() => {
    requestQuery = vi.fn().mockResolvedValue([])
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('list', () => {
    it('filters by tenant name, channel, status and date, newest first, with counts', async () => {
      build({ manyAndCount: [[request], 31] })
      requestQuery.mockResolvedValue([{ id: 'req-1', deliveries: '3', failed: '2', listed: '1' }])

      const result = await service.list(
        {
          page: 2,
          limit: 15,
          filter: [
            'channel:in:EMAIL|SMS',
            'status:in:failed',
            'createdAt:gte:2026-11-03T00:00:00.000Z',
          ],
        },
        ' parks ',
      )

      const clauses = requestQb.where.map(([clause]) => clause)
      expect(clauses).toContain('n.isInternal = :internal')
      expect(requestQb.where).toContainEqual([
        String.raw`t.name ILIKE :search ESCAPE '\'`,
        { search: '%parks%' },
      ])
      expect(requestQb.where).toContainEqual([
        'jsonb_exists_any(n.channel_codes, ARRAY[:...channels]::text[])',
        { channels: ['EMAIL', 'SMS'] },
      ])
      expect(clauses.some((c) => c.startsWith('LOWER(n.status) IN'))).toBe(true)
      expect(clauses.some((c) => c.startsWith('n.createdAt >='))).toBe(true)
      // channel is applied as jsonb containment, never as a column comparison
      expect(clauses.some((c) => c.includes('n.channelCodes'))).toBe(false)
      expect(requestQb.log).toContainEqual(['addOrderBy', 'n.createdAt', 'DESC'])
      expect(requestQb.log).toContainEqual(['skip', 15])

      expect(result).toEqual({
        data: [
          {
            id: 'req-1',
            tenantId: 't-1',
            tenantName: 'Parks',
            status: { code: 'failed', displayName: 'Failed' },
            channels: ['EMAIL'],
            requestRoute: 'notifysimple',
            createdAt: '2026-11-10T10:00:00.000Z',
            scheduledFor: null,
            recipientCount: 3,
            failedCount: 2,
          },
        ],
        count: 31,
        page: 2,
        limit: 15,
        totalPages: 3,
      })
    })

    it('never selects recipients or payload', async () => {
      build({ manyAndCount: [[], 0] })
      await service.list({ page: 1, limit: 15 })

      const selected = requestQb.log
        .filter(([call]) => call === 'select')
        .flatMap(([, cols]) => cols)
      expect(selected).not.toContain('n.recipients')
      expect(selected).not.toContain('n.payload')
      expect(requestQuery).not.toHaveBeenCalled()
    })

    it('counts the addresses on the request before any deliveries exist', async () => {
      build({ manyAndCount: [[request], 1] })
      requestQuery.mockResolvedValue([{ id: 'req-1', deliveries: '0', failed: '0', listed: '4' }])

      const { data } = await service.list({ page: 1, limit: 15 })

      expect(data[0]).toMatchObject({ recipientCount: 4, failedCount: 0 })
    })
  })

  describe('findOne', () => {
    it('returns the redacted error, history without repeats, delivery counts and log link', async () => {
      vi.stubEnv('NAMESPACE', 'f6bc3f-test')
      build(
        {
          one: {
            ...request,
            errorReason: 'CHES rejected jane@gov.bc.ca and 2505550123',
            recipients: { email: ['jane@gov.bc.ca'], sms: ['2505550123'] },
            quarantineDetails: {
              viruses: ['EICAR'],
              filename: 'Jane Doe medical.pdf',
              scannedAt: '2026-11-10T10:01:00.000Z',
              reason: 'Malware detected',
            },
          },
        },
        { rawMany: [{ channel: 'EMAIL', status: 'failed', count: '2' }] },
      )
      requestQuery.mockImplementation((sql: string) =>
        Promise.resolve(
          sql.includes('notification_request_history')
            ? [
                { status: 'queued', at: new Date('2026-11-10T10:00:00Z') },
                { status: 'queued', at: new Date('2026-11-10T10:00:01Z') },
                { status: 'processing', at: new Date('2026-11-10T10:00:02Z') },
                { status: 'failed', at: new Date('2026-11-10T10:05:00Z') },
              ]
            : [{ id: 'req-1', deliveries: '2', failed: '2', listed: '1' }],
        ),
      )

      const detail = await service.findOne('req-1')

      expect(detail.errorReason).toBe('CHES rejected [recipient] and [recipient]')
      expect(detail.quarantine).toEqual({
        viruses: ['EICAR'],
        reason: 'Malware detected',
        scannedAt: '2026-11-10T10:01:00.000Z',
      })
      expect(detail.statusHistory.map((s) => s.status)).toEqual(['queued', 'processing', 'failed'])
      expect(detail.deliveryCounts).toEqual([{ channel: 'EMAIL', status: 'failed', count: 2 }])
      expect(detail.logsUrl).toContain('explore')
      expect(JSON.stringify(detail)).not.toContain('jane@gov.bc.ca')
      expect(detail).not.toHaveProperty('recipients')
    })

    it('is not found for an unknown id', async () => {
      build({ one: null })
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('listDeliveries', () => {
    it('returns each delivery without its address, redacting it from the error text', async () => {
      build(
        {},
        {
          manyAndCount: [
            [
              {
                id: 'd-1',
                channel: 'EMAIL',
                status: 'failed',
                attemptCount: 3,
                lastAttemptAt: new Date('2026-11-10T10:04:00.000Z'),
                errorMessage: '550 mailbox jane@gov.bc.ca unavailable',
                providerResponseId: 'msg-9',
                providerResponse: { to: 'jane@gov.bc.ca', code: 550 },
                recipientAddress: 'jane@gov.bc.ca',
              },
            ],
            1,
          ],
        },
      )

      const result = await service.listDeliveries('req-1', {
        page: 1,
        limit: 15,
        filter: ['status:in:failed'],
      })

      expect(detailQb.where[0]).toEqual(['d.notificationRequestId = :id', { id: 'req-1' }])
      expect(result.data).toEqual([
        {
          id: 'd-1',
          channel: 'EMAIL',
          status: 'failed',
          attemptCount: 3,
          lastAttemptAt: '2026-11-10T10:04:00.000Z',
          errorMessage: '550 mailbox [recipient] unavailable',
          providerResponseId: 'msg-9',
          providerResponse: '{"to":"[recipient]","code":550}',
        },
      ])
      expect(result.totalPages).toBe(1)
    })
  })
})
