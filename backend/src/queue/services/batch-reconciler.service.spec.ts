import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Bull from 'bull'
import type Redis from 'ioredis'
import type { Repository } from 'typeorm'
import { BatchReconcilerService } from './batch-reconciler.service'
import { NotificationStatus } from '../../enum/notification-status.enum'
import type { NotificationRequestDetail } from '../../api/notification/entities/notification-request-detail.entity'
import type { NotificationRequest } from '../../api/notification/entities/notification-request.entity'
import type { NotificationService } from '../../api/notification/notification.service'

const BATCH = {
  batchId: 'req-1-EMAIL-0',
  notifyId: 'req-1',
  tenantId: 'tenant-1',
  channel: 'EMAIL',
}

const storedRequest = {
  id: 'req-1',
  payload: {
    email: {
      content: { subject: 'Hi', body: 'Hello {{name}}', bodyType: 'text' },
      recipients: {
        mergeArray: [
          ['email', 'name'],
          ['a@example.com', 'Ann'],
          ['b@example.com', 'Bo'],
          ['other-batch@example.com', 'Cy'],
        ],
      },
    },
  },
}

function setup({
  job,
  locked = 'OK',
  attempt = 1,
  stale = [BATCH],
}: {
  job?: Partial<Bull.Job> | null
  locked?: string | null
  attempt?: number
  stale?: object[]
}) {
  const builder: Record<string, unknown> = {}
  for (const m of [
    'innerJoin',
    'select',
    'addSelect',
    'where',
    'andWhere',
    'groupBy',
    'addGroupBy',
    'orderBy',
    'limit',
  ]) {
    builder[m] = vi.fn(() => builder)
  }
  builder.getRawMany = vi.fn().mockResolvedValue(stale)

  const detailRepository = {
    createQueryBuilder: vi.fn(() => builder),
    find: vi
      .fn()
      .mockResolvedValue([
        { recipientAddress: 'a@example.com' },
        { recipientAddress: 'b@example.com' },
      ]),
    update: vi.fn().mockResolvedValue({ affected: 2 }),
    count: vi.fn().mockResolvedValue(0),
  }
  const requestRepository = { findOne: vi.fn().mockResolvedValue(storedRequest) }
  const notificationService = {
    parseMailMergeRecipients: (rows: string[][]) =>
      rows.slice(1).map(([address, name]) => ({ address, params: { name } })),
    update: vi.fn().mockResolvedValue(undefined),
  }
  const redis = {
    set: vi.fn().mockResolvedValue(locked),
    eval: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(attempt),
    expire: vi.fn().mockResolvedValue(1),
  }
  const queue = {
    getJob: vi.fn().mockResolvedValue(job ?? null),
    add: vi.fn().mockResolvedValue({}),
  }
  const service = new BatchReconcilerService(
    detailRepository as unknown as Repository<NotificationRequestDetail>,
    requestRepository as unknown as Repository<NotificationRequest>,
    notificationService as unknown as NotificationService,
    redis as unknown as Redis,
    queue as unknown as Bull.Queue,
    null,
  )
  return { service, detailRepository, notificationService, redis, queue }
}

const jobIn = (state: string, extra: Partial<Bull.Job> = {}) =>
  ({
    getState: vi.fn().mockResolvedValue(state),
    retry: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    failedReason: 'job stalled more than allowable limit',
    ...extra,
  }) as unknown as Bull.Job

describe('BatchReconcilerService', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(['waiting', 'active', 'delayed'])('leaves a %s batch alone', async (state) => {
    const job = jobIn(state)
    const { service, queue, redis } = setup({ job })

    expect(await service.reconcile()).toEqual({ 'in-progress': 1 })
    expect(job.retry).not.toHaveBeenCalled()
    expect(queue.add).not.toHaveBeenCalled()
    // A long batch still running must not use up its recovery attempts.
    expect(redis.incr).not.toHaveBeenCalled()
  })

  it('retries a batch whose job failed, keeping its original payload', async () => {
    const job = jobIn('failed')
    const { service, queue } = setup({ job })

    expect(await service.reconcile()).toEqual({ retried: 1 })
    expect(job.retry).toHaveBeenCalled()
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('rebuilds a batch with no job from the stored request, leaving recipients in its rows', async () => {
    const { service, queue } = setup({ job: null })

    expect(await service.reconcile()).toEqual({ requeued: 1 })
    const [payload, options] = queue.add.mock.calls[0]
    expect(payload).toMatchObject({
      notifyId: 'req-1',
      tenantId: 'tenant-1',
      channel: 'EMAIL',
      mailMerge: true,
      batchId: 'req-1-EMAIL-0',
      mailMergeData: {
        content: { subject: 'Hi', body: 'Hello {{name}}', bodyType: 'text' },
        params: {},
      },
    })
    expect(payload.mailMergeData).not.toHaveProperty('recipients')
    expect(options).toMatchObject({ jobId: 'req-1-EMAIL-0', attempts: 3 })
  })

  it('replaces a job that finished while recipients are still owed', async () => {
    const job = jobIn('completed')
    const { service, queue } = setup({ job })

    expect(await service.reconcile()).toEqual({ requeued: 1 })
    expect(job.remove).toHaveBeenCalled()
    expect(queue.add).toHaveBeenCalled()
  })

  it('gives up after the recovery limit: marks what is owed failed and settles the request', async () => {
    const { service, detailRepository, notificationService, queue } = setup({
      job: jobIn('failed'),
      attempt: 6,
    })
    detailRepository.count.mockResolvedValueOnce(0).mockResolvedValueOnce(120)

    expect(await service.reconcile()).toEqual({ 'gave-up': 1 })
    expect(detailRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ notificationRequestId: 'req-1', batchId: 'req-1-EMAIL-0' }),
      expect.objectContaining({
        status: 'failed',
        errorMessage: expect.stringMatching(/5 recovery/),
      }),
    )
    expect(notificationService.update).toHaveBeenCalledWith('req-1', 'tenant-1', {
      status: NotificationStatus.PARTIALLY_COMPLETED,
      updatedBy: 'batch-reconciler',
    })
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('does nothing when another pod holds the lock', async () => {
    const { service, queue, detailRepository } = setup({ job: null, locked: null })

    expect(await service.reconcile()).toEqual({})
    expect(detailRepository.createQueryBuilder).not.toHaveBeenCalled()
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('keeps going past a batch it cannot reconcile, and releases the lock', async () => {
    const { service, queue, redis } = setup({
      job: null,
      stale: [{ ...BATCH, channel: 'SMS' }, BATCH],
    })

    // No SMS queue was given, so the first batch throws; the second is still requeued.
    expect(await service.reconcile()).toEqual({ requeued: 1 })
    expect(queue.add).toHaveBeenCalledTimes(1)
    expect(redis.eval).toHaveBeenCalled()
  })
})
