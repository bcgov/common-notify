import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Bull from 'bull'
import type Redis from 'ioredis'
import type { Repository } from 'typeorm'
import { DeliveryReconcilerService } from './delivery-reconciler.service'
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
  tenantId: 'tenant-1',
  createdAt: new Date('2026-10-04T12:00:00Z'),
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
  deliveries = [],
  ingestions = [],
  pending = [],
  scheduled = [],
  ingestionJob = null,
}: {
  job?: Partial<Bull.Job> | null
  locked?: string | null
  attempt?: number
  /** Stale merge batches, then stale plain-send deliveries: the two detail queries, in order. */
  stale?: object[]
  deliveries?: object[]
  /** Requests stuck at QUEUED. */
  ingestions?: object[]
  /** Requests still PENDING; queried before the QUEUED ones. */
  pending?: object[]
  /** Scheduled sends past their send time; queried after the QUEUED ones. */
  scheduled?: object[]
  ingestionJob?: Partial<Bull.Job> | null
}) {
  const results = [stale, deliveries]
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
  builder.getRawMany = vi.fn(() => Promise.resolve(results.shift() ?? []))

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
  const requestBuilder: Record<string, unknown> = {}
  for (const m of ['select', 'addSelect', 'where', 'andWhere', 'orderBy', 'limit']) {
    requestBuilder[m] = vi.fn(() => requestBuilder)
  }
  const requestResults = [pending, ingestions, scheduled]
  requestBuilder.getRawMany = vi.fn(() => Promise.resolve(requestResults.shift() ?? []))
  const requestRepository = {
    findOne: vi.fn().mockResolvedValue(storedRequest),
    createQueryBuilder: vi.fn(() => requestBuilder),
  }
  const ingestionQueue = {
    getJob: vi.fn().mockResolvedValue(ingestionJob),
    add: vi.fn().mockResolvedValue({}),
  }
  const notificationService = {
    parseMailMergeRecipients: (rows: string[][]) =>
      rows.slice(1).map(([address, name]) => ({ address, params: { name } })),
    update: vi.fn().mockResolvedValue(undefined),
  }
  const multi: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const m of ['set', 'hincrby', 'expire', 'lpush', 'ltrim']) {
    multi[m] = vi.fn(() => multi)
  }
  multi.exec = vi.fn().mockResolvedValue([])
  const redis = {
    multi: vi.fn(() => multi),
    set: vi.fn().mockResolvedValue(locked),
    eval: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(attempt),
    expire: vi.fn().mockResolvedValue(1),
  }
  const queue = {
    getJob: vi.fn().mockResolvedValue(job ?? null),
    add: vi.fn().mockResolvedValue({}),
  }
  const service = new DeliveryReconcilerService(
    detailRepository as unknown as Repository<NotificationRequestDetail>,
    requestRepository as unknown as Repository<NotificationRequest>,
    notificationService as unknown as NotificationService,
    redis as unknown as Redis,
    queue as unknown as Bull.Queue,
    null,
    ingestionQueue as unknown as Bull.Queue,
  )
  return {
    service,
    detailRepository,
    requestRepository,
    notificationService,
    redis,
    multi,
    queue,
    ingestionQueue,
  }
}

const jobIn = (state: string, extra: Partial<Bull.Job> = {}) =>
  ({
    getState: vi.fn().mockResolvedValue(state),
    retry: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    failedReason: 'job stalled more than allowable limit',
    ...extra,
  }) as unknown as Bull.Job

describe('DeliveryReconcilerService', () => {
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
      updatedBy: 'delivery-reconciler',
    })
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('records the pass and what it acted on for the monitoring page', async () => {
    const { service, multi } = setup({ job: jobIn('failed') })

    await service.reconcile()

    const [, pass] = multi.set.mock.calls[0]
    expect(JSON.parse(pass)).toMatchObject({ found: 1, outcomes: { retried: 1 } })
    expect(multi.hincrby).toHaveBeenCalledWith(expect.any(String), 'retried', 1)
    expect(JSON.parse(multi.lpush.mock.calls[0][1])).toMatchObject({
      kind: 'batch',
      action: 'retried',
      jobId: 'req-1-EMAIL-0',
      notifyId: 'req-1',
    })
  })

  it('records a pass that found only live work without logging any action', async () => {
    const { service, multi } = setup({ job: jobIn('active') })

    expect(await service.reconcile()).toEqual({ 'in-progress': 1 })
    expect(multi.set).toHaveBeenCalled()
    expect(multi.lpush).not.toHaveBeenCalled()
  })

  it('still reconciles when the pass cannot be recorded', async () => {
    const { service, multi } = setup({ job: jobIn('failed') })
    multi.exec.mockRejectedValue(new Error('READONLY'))

    expect(await service.reconcile()).toEqual({ retried: 1 })
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

  describe('plain sends', () => {
    const DELIVERY = { notifyId: 'req-1', tenantId: 'tenant-1', channel: 'EMAIL' }

    it('retries a failed delivery job', async () => {
      const job = jobIn('failed')
      const { service, queue } = setup({ job, stale: [], deliveries: [DELIVERY] })

      expect(await service.reconcile()).toEqual({ retried: 1 })
      expect(queue.getJob).toHaveBeenCalledWith('req-1_EMAIL')
      expect(job.retry).toHaveBeenCalled()
    })

    it('replaces a lost delivery job by running ingestion for the request again', async () => {
      const { service, queue, ingestionQueue } = setup({
        job: null,
        stale: [],
        deliveries: [DELIVERY],
      })

      expect(await service.reconcile()).toEqual({ requeued: 1 })
      expect(queue.add).not.toHaveBeenCalled()
      expect(ingestionQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ notifyId: 'req-1', tenantId: 'tenant-1' }),
        expect.objectContaining({ jobId: 'req-1', attempts: 3 }),
      )
    })

    it('leaves a lost delivery alone while ingestion is already running for the request', async () => {
      const { service, ingestionQueue, redis } = setup({
        job: null,
        stale: [],
        deliveries: [DELIVERY],
        ingestionJob: jobIn('active'),
      })

      expect(await service.reconcile()).toEqual({ 'in-progress': 1 })
      expect(ingestionQueue.add).not.toHaveBeenCalled()
      expect(redis.incr).not.toHaveBeenCalled()
    })

    it("gives up on one channel's recipients without touching merge batches", async () => {
      const { service, detailRepository } = setup({
        job: jobIn('failed'),
        stale: [],
        deliveries: [DELIVERY],
        attempt: 6,
      })

      expect(await service.reconcile()).toEqual({ 'gave-up': 1 })
      expect(detailRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationRequestId: 'req-1',
          channel: 'EMAIL',
          batchId: expect.anything(),
        }),
        expect.objectContaining({ status: 'failed' }),
      )
    })
  })

  describe('requests never ingested', () => {
    it('re-queues ingestion for a request stuck at QUEUED with no live job', async () => {
      const { service, ingestionQueue } = setup({
        job: null,
        stale: [],
        ingestions: [{ notifyId: 'req-1', tenantId: 'tenant-1' }],
      })

      expect(await service.reconcile()).toEqual({ requeued: 1 })
      expect(ingestionQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ notifyId: 'req-1', mailMerge: true, mailMergeChannel: 'EMAIL' }),
        expect.objectContaining({ jobId: 'req-1' }),
      )
    })

    it('retries a failed ingestion job', async () => {
      const ingestionJob = jobIn('failed')
      const { service } = setup({
        stale: [],
        ingestions: [{ notifyId: 'req-1', tenantId: 'tenant-1' }],
        ingestionJob,
      })

      expect(await service.reconcile()).toEqual({ retried: 1 })
      expect(ingestionJob.retry).toHaveBeenCalled()
    })
  })

  describe('requests never queued (PENDING)', () => {
    const PENDING = [{ notifyId: 'req-1', tenantId: 'tenant-1' }]

    it('queues ingestion from the stored request, unnamed, and moves the request to QUEUED', async () => {
      const { service, ingestionQueue, notificationService } = setup({
        stale: [],
        pending: PENDING,
      })

      expect(await service.reconcile()).toEqual({ requeued: 1 })
      const [payload, options] = ingestionQueue.add.mock.calls[0]
      // Unnamed: the ingestion worker registers Bull's default handler; a named job finds none.
      expect(typeof payload).toBe('object')
      expect(payload).toMatchObject({
        notifyId: 'req-1',
        mailMerge: true,
        mailMergeChannel: 'EMAIL',
      })
      expect(options).toMatchObject({ jobId: 'req-1', attempts: 3 })
      expect(options).not.toHaveProperty('delay')
      expect(notificationService.update).toHaveBeenCalledWith('req-1', 'tenant-1', {
        status: NotificationStatus.QUEUED,
        updatedBy: 'delivery-reconciler',
      })
    })

    it('keeps a scheduled send scheduled instead of sending it now', async () => {
      const { service, ingestionQueue, notificationService, requestRepository } = setup({
        stale: [],
        pending: PENDING,
      })
      const sendAt = new Date(Date.now() + 60 * 60_000).toISOString()
      requestRepository.findOne.mockResolvedValue({
        ...storedRequest,
        payload: {
          email: {
            recipients: { to: ['a@example.com'] },
            content: { subject: 'S', body: 'B' },
            delayedSend: sendAt,
          },
        },
      })

      await service.reconcile()

      const [payload, options] = ingestionQueue.add.mock.calls[0]
      expect(payload.scheduledFor).toBe(sendAt)
      expect(options.delay).toBeGreaterThan(59 * 60_000)
      expect(notificationService.update).toHaveBeenCalledWith('req-1', 'tenant-1', {
        status: NotificationStatus.SCHEDULED,
        updatedBy: 'delivery-reconciler',
      })
    })

    it('leaves a PENDING request alone while its ingestion job is queued', async () => {
      const { service, ingestionQueue } = setup({
        stale: [],
        pending: PENDING,
        ingestionJob: jobIn('waiting'),
      })

      expect(await service.reconcile()).toEqual({ 'in-progress': 1 })
      expect(ingestionQueue.add).not.toHaveBeenCalled()
    })
  })

  describe('scheduled sends past their send time', () => {
    const SCHEDULED = [{ notifyId: 'req-1', tenantId: 'tenant-1' }]
    const overdueRequest = {
      ...storedRequest,
      payload: {
        email: {
          recipients: { to: ['a@example.com'] },
          content: { subject: 'S', body: 'B' },
          delayedSend: '2026-10-04T13:00:00Z',
        },
      },
    }

    it('runs ingestion now when the delayed job was lost, leaving the status to ingestion', async () => {
      const { service, ingestionQueue, notificationService, requestRepository } = setup({
        stale: [],
        scheduled: SCHEDULED,
      })
      requestRepository.findOne.mockResolvedValue(overdueRequest)

      expect(await service.reconcile()).toEqual({ requeued: 1 })
      const [payload, options] = ingestionQueue.add.mock.calls[0]
      expect(payload).toMatchObject({ notifyId: 'req-1', scheduledFor: '2026-10-04T13:00:00Z' })
      expect(options).toMatchObject({ jobId: 'req-1' })
      expect(options).not.toHaveProperty('delay')
      expect(notificationService.update).not.toHaveBeenCalled()
    })

    it('leaves a send whose job is still delayed alone', async () => {
      const { service, ingestionQueue } = setup({
        stale: [],
        scheduled: SCHEDULED,
        ingestionJob: jobIn('delayed'),
      })

      expect(await service.reconcile()).toEqual({ 'in-progress': 1 })
      expect(ingestionQueue.add).not.toHaveBeenCalled()
    })

    it('retries a delayed job that failed', async () => {
      const ingestionJob = jobIn('failed')
      const { service } = setup({ stale: [], scheduled: SCHEDULED, ingestionJob })

      expect(await service.reconcile()).toEqual({ retried: 1 })
      expect(ingestionJob.retry).toHaveBeenCalled()
    })

    it('settles the request as failed after the recovery limit', async () => {
      const { service, ingestionQueue, notificationService } = setup({
        stale: [],
        scheduled: SCHEDULED,
        attempt: 6,
      })

      expect(await service.reconcile()).toEqual({ 'gave-up': 1 })
      expect(ingestionQueue.add).not.toHaveBeenCalled()
      expect(notificationService.update).toHaveBeenCalledWith('req-1', 'tenant-1', {
        status: NotificationStatus.FAILED,
        updatedBy: 'delivery-reconciler',
      })
    })
  })
})
