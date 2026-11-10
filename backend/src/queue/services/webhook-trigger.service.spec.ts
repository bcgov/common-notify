import { ConfigService } from '@nestjs/config'
import { vi } from 'vitest'
import type { Queue } from 'bullmq'
import { WebhookTriggerService } from './webhook-trigger.service'
import { WebhookService } from '../../api/webhook/webhook.service'
import { WebhookJobPayload } from '../queue.types'

const redisMock = vi.hoisted(() => ({
  psubscribe: vi.fn(),
  on: vi.fn(),
  punsubscribe: vi.fn(),
  quit: vi.fn(),
}))

vi.mock('ioredis', () => ({
  default: vi.fn(function () {
    return redisMock
  }),
}))

describe('WebhookTriggerService', () => {
  const mockConfigService = {
    get: vi.fn().mockReturnValue({ host: 'localhost', port: 6379, db: 0 }),
  }
  const mockWebhookService = {
    findActiveByTenant: vi.fn(),
  }
  const mockQueue = {
    name: 'webhook-delivery',
    add: vi.fn(),
  }

  let service: WebhookTriggerService

  /** Delivers a pub/sub message to the service and waits for its webhook processing to finish. */
  const publish = async (tenantId: string, notification: Record<string, unknown>) => {
    const handler = redisMock.on.mock.calls.find(([event]) => event === 'pmessage')![1]
    handler(
      'notification:changed:*',
      `notification:changed:${tenantId}`,
      JSON.stringify(notification),
    )
    await vi.waitFor(() => expect(mockWebhookService.findActiveByTenant).toHaveBeenCalled())
    await new Promise((resolve) => setImmediate(resolve))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockConfigService.get.mockReturnValue({ host: 'localhost', port: 6379, db: 0 })
    service = new WebhookTriggerService(
      mockConfigService as unknown as ConfigService,
      mockWebhookService as unknown as WebhookService,
      mockQueue as unknown as Queue<WebhookJobPayload>,
    )
    service.onModuleInit()
  })

  it('queues a job when the webhook channel matches the notification channel', async () => {
    mockWebhookService.findActiveByTenant.mockResolvedValue([
      { id: 'wh-1', triggerOn: ['success'], channelType: ['EMAIL'] },
    ])

    await publish('tenant-1', {
      id: 'notif-1',
      status: { code: 'COMPLETED', displayName: 'Completed' },
      channelCodes: ['email', 'sms'],
    })

    expect(mockQueue.add).toHaveBeenCalledWith(
      'webhook-delivery',
      expect.objectContaining({
        notificationId: 'notif-1',
        tenantId: 'tenant-1',
        webhookId: 'wh-1',
        payload: expect.objectContaining({ status: 'COMPLETED', channel: 'email, sms' }),
      }),
      expect.objectContaining({ jobId: 'webhook_wh-1_notif-1_completed' }),
    )
  })

  it('does not queue a job when the webhook channel does not match', async () => {
    mockWebhookService.findActiveByTenant.mockResolvedValue([
      { id: 'wh-1', triggerOn: [], channelType: ['msgApp'] },
    ])

    await publish('tenant-1', {
      id: 'notif-1',
      status: { code: 'COMPLETED' },
      channelCodes: ['email'],
    })

    expect(mockQueue.add).not.toHaveBeenCalled()
  })

  it('does not queue a job when the status does not match the trigger', async () => {
    mockWebhookService.findActiveByTenant.mockResolvedValue([
      { id: 'wh-1', triggerOn: ['failure'], channelType: [] },
    ])

    await publish('tenant-1', { id: 'notif-1', status: { code: 'COMPLETED' } })

    expect(mockQueue.add).not.toHaveBeenCalled()
  })

  it('queues for any channel when the webhook has no channel filter', async () => {
    mockWebhookService.findActiveByTenant.mockResolvedValue([{ id: 'wh-1' }])

    await publish('tenant-1', { id: 'notif-1', status: { code: 'FAILED' } })

    expect(mockQueue.add).toHaveBeenCalledTimes(1)
  })

  it('keeps queueing other webhooks when one add fails', async () => {
    mockWebhookService.findActiveByTenant.mockResolvedValue([{ id: 'wh-1' }, { id: 'wh-2' }])
    mockQueue.add.mockRejectedValueOnce(new Error('redis down')).mockResolvedValueOnce({})

    await publish('tenant-1', { id: 'notif-1', status: { code: 'FAILED' } })

    expect(mockQueue.add).toHaveBeenCalledTimes(2)
  })

  it('does nothing when the tenant has no active webhooks', async () => {
    mockWebhookService.findActiveByTenant.mockResolvedValue([])

    await publish('tenant-1', { id: 'notif-1', status: { code: 'COMPLETED' } })

    expect(mockQueue.add).not.toHaveBeenCalled()
  })
})
