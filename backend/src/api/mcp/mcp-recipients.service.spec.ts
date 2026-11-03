import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationService } from '../notification/notification.service'
import { NotificationRequestDetailService } from '../notification/notification-request-detail.service'
import type { ParsedListQuery } from '../../common/query/list-query.types'
import { McpRecipientsService } from './mcp-recipients.service'

const notificationId = 'b0706af4-78eb-4aa3-a15c-174a8c5f5285'
const tenantId = 'internal-tenant'
const iso = '2026-01-02T03:04:05.000Z'

function recipient(lastAttemptAt: unknown = new Date(iso)) {
  return {
    recipientAddress: ' Mixed.Case+tag@example.com ',
    channel: 'EMAIL',
    status: 'sent',
    attemptCount: 2,
    lastAttemptAt,
  }
}

function response(query: ParsedListQuery, data = [recipient()]) {
  return {
    data,
    count: data.length,
    page: query.page,
    limit: query.limit,
    totalPages: Math.ceil(data.length / query.limit),
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('McpRecipientsService', () => {
  let service: McpRecipientsService
  const notifications = { findOne: vi.fn() }
  const details = { findByRequestIdPaginated: vi.fn() }

  beforeEach(async () => {
    vi.resetAllMocks()
    notifications.findOne.mockResolvedValue({})
    details.findByRequestIdPaginated.mockImplementation(
      (_id: string, _tenant: string, query: ParsedListQuery) => response(query),
    )
    const module = await Test.createTestingModule({
      providers: [
        McpRecipientsService,
        { provide: NotificationService, useValue: notifications },
        { provide: NotificationRequestDetailService, useValue: details },
      ],
    }).compile()
    service = module.get(McpRecipientsService)
  })

  it.each([undefined, null, '', '   ', 123])('rejects missing tenant %s first', async (tenant) => {
    await expect(
      service.getNotificationRecipients(tenant as string, { notificationId: 'invalid' }),
    ).rejects.toThrow(new ForbiddenException('Tenant context is required'))
    expect(notifications.findOne).not.toHaveBeenCalled()
    expect(details.findByRequestIdPaginated).not.toHaveBeenCalled()
  })

  it.each(['', '  ', 'not-a-uuid'])('rejects invalid notification id %s', async (id) => {
    await expect(
      service.getNotificationRecipients(tenantId, { notificationId: id }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(notifications.findOne).not.toHaveBeenCalled()
    expect(details.findByRequestIdPaginated).not.toHaveBeenCalled()
  })

  it('ignores extra input and checks ownership before retrieving recipients', async () => {
    const ownership = deferred<object>()
    notifications.findOne.mockReturnValue(ownership.promise)
    const pending = service.getNotificationRecipients(tenantId, {
      notificationId,
      tenantId: 'external-tenant',
      search: 'injected',
      filter: ['status:eq:failed'],
      sort: 'status',
    } as any)
    expect(notifications.findOne).toHaveBeenCalledExactlyOnceWith(notificationId, tenantId)
    expect(details.findByRequestIdPaginated).not.toHaveBeenCalled()
    ownership.resolve({})
    await pending
    expect(details.findByRequestIdPaginated).toHaveBeenCalledExactlyOnceWith(
      notificationId,
      tenantId,
      {
        page: 1,
        limit: 25,
        skip: 0,
        filters: [],
        sorts: [{ field: 'createdAt', direction: 'DESC' }],
      },
    )
  })

  it('propagates the exact ownership error without retrieving recipients', async () => {
    const error = new NotFoundException('Not found for tenant')
    notifications.findOne.mockRejectedValue(error)
    await expect(service.getNotificationRecipients(tenantId, { notificationId })).rejects.toBe(
      error,
    )
    expect(details.findByRequestIdPaginated).not.toHaveBeenCalled()
  })

  it.each([
    [0, 1],
    [-1, 1],
    [51, 50],
    [500, 50],
    [NaN, 25],
    [Infinity, 25],
    [null, 25],
    [undefined, 25],
    [10.7, 10],
    ['10', 25],
  ])('clamps pageSize %s to %s', async (pageSize, limit) => {
    await service.getNotificationRecipients(tenantId, { notificationId, page: 3, pageSize })
    expect(details.findByRequestIdPaginated).toHaveBeenCalledExactlyOnceWith(
      notificationId,
      tenantId,
      expect.objectContaining({ page: 3, limit, skip: 2 * Number(limit) }),
    )
  })

  it.each([
    [0, 1],
    [-5, 1],
    [NaN, 1],
    [1.5, 1],
    [Number.MAX_SAFE_INTEGER, 100000],
    [Infinity, 1],
    [null, 1],
    [undefined, 1],
    ['10', 1],
    [2.9, 2],
  ])('clamps page %s to %s with a finite skip', async (page, expectedPage) => {
    await service.getNotificationRecipients(tenantId, { notificationId, page, pageSize: 50 })
    const query = details.findByRequestIdPaginated.mock.calls[0][2]
    expect(query).toStrictEqual({
      page: expectedPage,
      limit: 50,
      skip: (Number(expectedPage) - 1) * 50,
      filters: [],
      sorts: [{ field: 'createdAt', direction: 'DESC' }],
    })
    expect(Number.isFinite(query.skip)).toBe(true)
  })

  it('maps only whitelisted fields and preserves stored addresses', async () => {
    const canary = 'LEAK_CANARY'
    const extras = Object.fromEntries(
      [
        'errorMessage',
        'providerResponseId',
        'params',
        'payload',
        'providerResponse',
        'createdBy',
        'batchId',
        'emailAddressType',
        'id',
        'tenant',
        'recipients',
      ].map((key) => [key, canary]),
    )
    notifications.findOne.mockResolvedValue({ ...extras, nested: { value: canary } })
    details.findByRequestIdPaginated.mockResolvedValue({
      ...extras,
      nested: { value: canary },
      data: [{ ...recipient(), ...extras, nested: { value: canary } }],
      count: 51,
      page: 2,
      limit: 25,
      totalPages: 3,
    })
    const output = await service.getNotificationRecipients(tenantId, { notificationId, page: 2 })
    expect(output).toStrictEqual({
      notificationId,
      recipients: [
        {
          address: ' Mixed.Case+tag@example.com ',
          channel: 'EMAIL',
          status: 'sent',
          attemptCount: 2,
          lastAttemptAt: iso,
        },
      ],
      total: 51,
      page: 2,
      pageSize: 25,
      totalPages: 3,
    })
    expect(Object.keys(output.recipients[0]).sort()).toStrictEqual([
      'address',
      'attemptCount',
      'channel',
      'lastAttemptAt',
      'status',
    ])
    expect(JSON.stringify(output)).not.toContain(canary)
  })

  it.each([
    [new Date(iso), iso],
    [iso, iso],
    [null, null],
    [undefined, null],
    ['invalid', null],
    [new Date(NaN), null],
    [{ nested: 'invalid' }, null],
  ])('safely maps lastAttemptAt %s', async (value, expected) => {
    const row = recipient()
    row.lastAttemptAt = value
    details.findByRequestIdPaginated.mockImplementation(
      (_id: string, _tenant: string, query: ParsedListQuery) => response(query, [row]),
    )
    const output = await service.getNotificationRecipients(tenantId, { notificationId })
    expect(output.recipients[0].lastAttemptAt).toBe(expected)
  })

  it('returns an empty recipient list', async () => {
    details.findByRequestIdPaginated.mockImplementation(
      (_id: string, _tenant: string, query: ParsedListQuery) => response(query, []),
    )
    expect(await service.getNotificationRecipients(tenantId, { notificationId })).toStrictEqual({
      notificationId,
      recipients: [],
      total: 0,
      page: 1,
      pageSize: 25,
      totalPages: 0,
    })
  })

  it('keeps interleaved tenant calls isolated across both awaits', async () => {
    const ownershipA = deferred<object>()
    const ownershipB = deferred<object>()
    const resultA = deferred<ReturnType<typeof response>>()
    const resultB = deferred<ReturnType<typeof response>>()
    notifications.findOne.mockImplementation((_id: string, tenant: string) =>
      tenant === 'tenant-a' ? ownershipA.promise : ownershipB.promise,
    )
    details.findByRequestIdPaginated.mockImplementation((_id: string, tenant: string) =>
      tenant === 'tenant-a' ? resultA.promise : resultB.promise,
    )
    const pendingA = service.getNotificationRecipients('tenant-a', { notificationId, page: 2 })
    const pendingB = service.getNotificationRecipients('tenant-b', { notificationId, pageSize: 10 })
    ownershipB.resolve({})
    await Promise.resolve()
    ownershipA.resolve({})
    await Promise.resolve()
    expect(notifications.findOne.mock.calls).toStrictEqual([
      [notificationId, 'tenant-a'],
      [notificationId, 'tenant-b'],
    ])
    expect(details.findByRequestIdPaginated.mock.calls).toStrictEqual([
      [
        notificationId,
        'tenant-b',
        {
          page: 1,
          limit: 10,
          skip: 0,
          filters: [],
          sorts: [{ field: 'createdAt', direction: 'DESC' }],
        },
      ],
      [
        notificationId,
        'tenant-a',
        {
          page: 2,
          limit: 25,
          skip: 25,
          filters: [],
          sorts: [{ field: 'createdAt', direction: 'DESC' }],
        },
      ],
    ])
    resultA.resolve({
      data: [{ ...recipient(), recipientAddress: 'a@example.com' }],
      count: 26,
      page: 2,
      limit: 25,
      totalPages: 2,
    })
    const outputA = await pendingA
    resultB.resolve({
      data: [{ ...recipient(), recipientAddress: 'b@example.com' }],
      count: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    })
    const outputB = await pendingB
    expect(outputA).toStrictEqual({
      notificationId,
      recipients: [
        {
          address: 'a@example.com',
          channel: 'EMAIL',
          status: 'sent',
          attemptCount: 2,
          lastAttemptAt: iso,
        },
      ],
      total: 26,
      page: 2,
      pageSize: 25,
      totalPages: 2,
    })
    expect(outputB).toStrictEqual({
      notificationId,
      recipients: [
        {
          address: 'b@example.com',
          channel: 'EMAIL',
          status: 'sent',
          attemptCount: 2,
          lastAttemptAt: iso,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    })
  })
})
