import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const clientMock = {
  get: vi.fn(),
  eval: vi.fn(),
  quit: vi.fn(async () => 'OK'),
  disconnect: vi.fn(),
}

vi.mock('../../../queue/redis-connection', () => ({
  createRedisClient: vi.fn(() => clientMock),
}))

import { NotificationDedupService } from './notification-dedup.service'
import type { NotificationService } from '../../notification/notification.service'

const TENANT = 'tenant-1'
const HOLDER = '6f1e0b7c-4a2d-4e8c-8f10-9d1e2f3a5b7c'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('NotificationDedupService', () => {
  const findOne = vi.fn()

  const build = (windowSeconds = 300) => {
    const config = {
      get: vi.fn((key: string) =>
        key === 'dedup.windowSeconds' ? windowSeconds : { host: 'localhost', port: 6379, db: 0 },
      ),
    } as unknown as ConfigService
    return new NotificationDedupService(config, { findOne } as unknown as NotificationService)
  }

  const record = (status: string) => ({
    id: HOLDER,
    status,
    channelCodes: ['email'],
    createdAt: new Date('2026-09-25T10:00:00Z'),
  })

  beforeEach(() => {
    vi.clearAllMocks()
    clientMock.quit.mockResolvedValue('OK')
  })

  describe('fingerprint', () => {
    const service = build()
    const email = (recipients: Record<string, string[]>, extra: Record<string, unknown> = {}) => ({
      email: { recipients, content: { subject: 'Hi', body: 'Hello' }, ...extra },
    })

    it('ignores recipient order, case and surrounding whitespace', () => {
      expect(service.fingerprint(email({ to: ['A@Example.com', 'b@example.com'] }))).toBe(
        service.fingerprint(email({ to: [' b@example.com', 'a@example.com'] })),
      )
    })

    it('treats differently formatted phone numbers as the same recipient', () => {
      const sms = (to: string[]) => ({ sms: { recipients: { to }, content: { body: 'Hi' } } })
      expect(service.fingerprint(sms(['250 555 0123']))).toBe(
        service.fingerprint(sms(['+12505550123'])),
      )
    })

    it('ignores object key order', () => {
      expect(service.fingerprint({ params: { a: 1, b: 2 }, ...email({ to: ['a@x.ca'] }) })).toBe(
        service.fingerprint({ ...email({ to: ['a@x.ca'] }), params: { b: 2, a: 1 } }),
      )
    })

    it('keeps to, cc and bcc apart', () => {
      expect(service.fingerprint(email({ to: ['a@x.ca'] }))).not.toBe(
        service.fingerprint(email({ cc: ['a@x.ca'] })),
      )
    })

    it.each([
      ['content', { content: { subject: 'Hi', body: 'Goodbye' } }],
      ['params', { params: { name: 'Bob' } }],
      ['delayedSend', { delayedSend: '2030-01-01T00:00:00Z' }],
      [
        'attachment content',
        { attachments: [{ filename: 'a.pdf', mimeType: 'application/pdf', content: 'Ym9i' }] },
      ],
    ])('treats a different %s as a different request', (_label, extra) => {
      const base = email({ to: ['a@x.ca'] }, { params: { name: 'Alice' } })
      const changed = email({ to: ['a@x.ca'] }, { params: { name: 'Alice' }, ...extra })
      expect(service.fingerprint(changed)).not.toBe(service.fingerprint(base))
    })

    it('hashes a mergeArray as given', () => {
      const merge = (rows: string[][]) => ({ email: { recipients: { mergeArray: rows } } })
      expect(service.fingerprint(merge([['to'], ['a@x.ca']]))).not.toBe(
        service.fingerprint(merge([['to'], ['b@x.ca']])),
      )
    })
  })

  describe('claim', () => {
    it('claims a free fingerprint for a new notifyId, namespaced and expiring with the window', async () => {
      clientMock.eval.mockResolvedValueOnce(null)

      const claim = await build(120).claim(TENANT, 'fp')

      expect(claim.kind).toBe('proceed')
      const notifyId = claim.kind === 'proceed' ? claim.notifyId : undefined
      expect(notifyId).toMatch(UUID)
      expect(clientMock.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'notify:dedup:tenant-1:fp',
        notifyId,
        '120000',
      )
    })

    it('returns the original when it is live', async () => {
      clientMock.eval.mockResolvedValueOnce(HOLDER)
      findOne.mockResolvedValue(record('completed'))

      const claim = await build().claim(TENANT, 'fp')

      expect(claim).toEqual({
        kind: 'duplicate',
        original: {
          notifyId: HOLDER,
          status: 'completed',
          channels: ['email'],
          createdAt: new Date('2026-09-25T10:00:00Z'),
        },
      })
      expect(findOne).toHaveBeenCalledWith(HOLDER, TENANT)
    })

    it('returns the holder as accepted while its row is still being written', async () => {
      clientMock.eval.mockResolvedValueOnce(HOLDER)
      findOne.mockRejectedValue(new NotFoundException())

      const claim = await build().claim(TENANT, 'fp')

      expect(claim).toMatchObject({
        kind: 'duplicate',
        original: { notifyId: HOLDER, status: 'accepted' },
      })
    })

    it.each(['failed', 'cancelled', 'quarantined', 'blocked'])(
      'takes over from a %s original, which never reached anyone',
      async (status) => {
        clientMock.eval.mockResolvedValueOnce(HOLDER).mockResolvedValueOnce(1)
        findOne.mockResolvedValue(record(status))

        const claim = await build().claim(TENANT, 'fp')

        expect(claim.kind).toBe('proceed')
        const notifyId = claim.kind === 'proceed' ? claim.notifyId : undefined
        // The swap is conditional on the holder we looked at.
        expect(clientMock.eval).toHaveBeenLastCalledWith(
          expect.stringContaining('get'),
          1,
          'notify:dedup:tenant-1:fp',
          HOLDER,
          notifyId,
          '300000',
        )
      },
    )

    it('looks again when another retry took over first, and defers to it', async () => {
      const winner = '0b7c6f1e-2d4a-4c8e-9f10-3a5b7c9d1e2f'
      clientMock.eval
        .mockResolvedValueOnce(HOLDER) // claim: the failed original holds it
        .mockResolvedValueOnce(0) // takeover: another retry swapped first
        .mockResolvedValueOnce(winner) // claim again: that retry now holds it
      findOne.mockImplementation(async (id: string) =>
        id === HOLDER ? record('failed') : { ...record('queued'), id: winner },
      )

      const claim = await build().claim(TENANT, 'fp')

      expect(claim).toMatchObject({ kind: 'duplicate', original: { notifyId: winner } })
    })

    it('treats a holder that is not an id as free to take over', async () => {
      clientMock.eval.mockResolvedValueOnce('garbage').mockResolvedValueOnce(1)

      const claim = await build().claim(TENANT, 'fp')

      expect(claim.kind).toBe('proceed')
      expect(findOne).not.toHaveBeenCalled()
    })

    it('sends without dedup when Redis is unavailable', async () => {
      clientMock.eval.mockRejectedValueOnce(new Error('Connection is closed.'))

      const claim = await build().claim(TENANT, 'fp')

      expect(claim.kind).toBe('proceed')
      if (claim.kind === 'proceed') await claim.release()
      // Nothing was claimed, so release has nothing to free.
      expect(clientMock.eval).toHaveBeenCalledTimes(1)
    })

    it('does nothing when the window is 0', async () => {
      const service = build(0)
      const claim = await service.claim(TENANT, 'fp')

      expect(service.enabled).toBe(false)
      expect(claim.kind).toBe('proceed')
      expect(clientMock.eval).not.toHaveBeenCalled()
    })

    it('releases only its own claim', async () => {
      clientMock.eval.mockResolvedValueOnce(null).mockResolvedValueOnce(1)

      const claim = await build().claim(TENANT, 'fp')
      if (claim.kind !== 'proceed') throw new Error('expected a claim')
      await claim.release()

      expect(clientMock.eval).toHaveBeenLastCalledWith(
        expect.stringContaining('del'),
        1,
        'notify:dedup:tenant-1:fp',
        claim.notifyId,
      )
    })

    it('does not fail the request when release fails', async () => {
      clientMock.eval.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('timeout'))

      const claim = await build().claim(TENANT, 'fp')
      if (claim.kind !== 'proceed') throw new Error('expected a claim')

      await expect(claim.release()).resolves.toBeUndefined()
    })
  })

  describe('findDuplicate', () => {
    it('returns a live original', async () => {
      clientMock.get.mockResolvedValue(HOLDER)
      findOne.mockResolvedValue(record('queued'))

      expect(await build().findDuplicate(TENANT, 'fp')).toMatchObject({ notifyId: HOLDER })
      expect(clientMock.get).toHaveBeenCalledWith('notify:dedup:tenant-1:fp')
    })

    it('ignores an original that was never delivered', async () => {
      clientMock.get.mockResolvedValue(HOLDER)
      findOne.mockResolvedValue(record('failed'))

      expect(await build().findDuplicate(TENANT, 'fp')).toBeNull()
    })

    it('reports nothing when Redis or the lookup fails, leaving claim to decide', async () => {
      clientMock.get.mockRejectedValueOnce(new Error('Connection is closed.'))
      expect(await build().findDuplicate(TENANT, 'fp')).toBeNull()

      clientMock.get.mockResolvedValue(HOLDER)
      findOne.mockRejectedValue(new Error('database down'))
      expect(await build().findDuplicate(TENANT, 'fp')).toBeNull()
    })
  })
})
