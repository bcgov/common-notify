import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { vi } from 'vitest'
import { SafelistService } from './safelist.service'
import { RecipientSafelist } from './entities/recipient-safelist.entity'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import { NotifyUser } from '../admin/users/entities/notify-user.entity'
import { FeatureFlagService } from '../feature-flag/feature-flag.service'
import { NotificationChannel } from '../../enum/notification-channel.enum'

describe('SafelistService', () => {
  let service: SafelistService

  const TENANT = 'tenant-uuid-1'

  const safelistRepository = {
    find: vi.fn(),
    findOne: vi.fn(),
    count: vi.fn(),
    create: vi.fn((entity) => entity),
    save: vi.fn((entity) => Promise.resolve({ id: 'entry-uuid-1', ...entity })),
  }

  const configurationRepository = {
    findOne: vi.fn(),
  }

  const notifyUserRepository = {
    find: vi.fn(),
  }

  const featureFlagService = {
    isEnabled: vi.fn(),
  }

  /** Entries the tenant has safelisted, as loadAllowed() would read them. */
  const givenEntries = (
    entries: Array<{ channelCode: string; recipientNormalized: string }>,
  ): void => {
    safelistRepository.find.mockResolvedValue(entries)
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafelistService,
        { provide: getRepositoryToken(RecipientSafelist), useValue: safelistRepository },
        { provide: getRepositoryToken(NotifyConfiguration), useValue: configurationRepository },
        { provide: getRepositoryToken(NotifyUser), useValue: notifyUserRepository },
        { provide: FeatureFlagService, useValue: featureFlagService },
      ],
    }).compile()

    service = module.get<SafelistService>(SafelistService)
    vi.clearAllMocks()
    featureFlagService.isEnabled.mockResolvedValue(true)
    configurationRepository.findOne.mockResolvedValue({ config: { value: 50 } })
    notifyUserRepository.find.mockResolvedValue([])
  })

  describe('findBlocked', () => {
    it('blocks nothing when the environment does not enforce the safelist (PROD)', async () => {
      featureFlagService.isEnabled.mockResolvedValue(false)

      const blocked = await service.findBlocked(TENANT, [
        { address: 'anyone@example.com', channel: NotificationChannel.EMAIL },
      ])

      expect(blocked).toEqual([])
      expect(safelistRepository.find).not.toHaveBeenCalled()
    })

    it('blocks every recipient when the tenant has no entries (fail closed)', async () => {
      givenEntries([])

      const blocked = await service.findBlocked(TENANT, [
        { address: 'someone@gov.bc.ca', channel: NotificationChannel.EMAIL },
      ])

      expect(blocked).toEqual(['someone@gov.bc.ca'])
    })

    it('allows a safelisted recipient regardless of the casing used to send', async () => {
      givenEntries([{ channelCode: 'EMAIL', recipientNormalized: 'person@gov.bc.ca' }])

      const blocked = await service.findBlocked(TENANT, [
        { address: 'PERSON@GOV.BC.CA', channel: NotificationChannel.EMAIL },
      ])

      expect(blocked).toEqual([])
    })

    it('allows a safelisted phone number regardless of formatting', async () => {
      givenEntries([{ channelCode: 'SMS', recipientNormalized: '+12505550100' }])

      const blocked = await service.findBlocked(TENANT, [
        { address: '(250) 555-0100', channel: NotificationChannel.SMS },
      ])

      expect(blocked).toEqual([])
    })

    it('does not let an EMAIL entry permit an SMS send to the same value', async () => {
      givenEntries([{ channelCode: 'EMAIL', recipientNormalized: '+12505550100' }])

      const blocked = await service.findBlocked(TENANT, [
        { address: '+12505550100', channel: NotificationChannel.SMS },
      ])

      expect(blocked).toEqual(['+12505550100'])
    })

    it('returns only the blocked recipients from a mixed request', async () => {
      givenEntries([{ channelCode: 'EMAIL', recipientNormalized: 'allowed@gov.bc.ca' }])

      const blocked = await service.findBlocked(TENANT, [
        { address: 'allowed@gov.bc.ca', channel: NotificationChannel.EMAIL },
        { address: 'stranger@example.com', channel: NotificationChannel.EMAIL },
      ])

      expect(blocked).toEqual(['stranger@example.com'])
    })

    it('blocks a recipient that cannot be normalized rather than letting it through', async () => {
      givenEntries([{ channelCode: 'SMS', recipientNormalized: '+12505550100' }])

      const blocked = await service.findBlocked(TENANT, [
        { address: 'not-a-number', channel: NotificationChannel.SMS },
      ])

      expect(blocked).toEqual(['not-a-number'])
    })

    it('ignores channels the safelist does not cover', async () => {
      const blocked = await service.findBlocked(TENANT, [
        { address: 'user-123', channel: 'MSGAPP' },
      ])

      expect(blocked).toEqual([])
      expect(safelistRepository.find).not.toHaveBeenCalled()
    })
  })

  describe('isEnforced caching', () => {
    it('reads the flag once for a burst of sends instead of once per send', async () => {
      const candidates = [{ address: 'someone@gov.bc.ca', channel: NotificationChannel.EMAIL }]
      givenEntries([])

      await Promise.all([
        service.findBlocked(TENANT, candidates),
        service.findBlocked(TENANT, candidates),
      ])
      await service.findBlocked(TENANT, candidates)

      expect(featureFlagService.isEnabled).toHaveBeenCalledTimes(1)
    })

    it('re-reads the flag once the cache expires, so a toggle takes effect', async () => {
      vi.useFakeTimers()
      try {
        featureFlagService.isEnabled.mockResolvedValue(false)
        expect(await service.isEnforced()).toBe(false)

        // Operator enables the guardrail in the admin screen.
        featureFlagService.isEnabled.mockResolvedValue(true)
        expect(await service.isEnforced()).toBe(false) // still cached

        vi.advanceTimersByTime(31_000)
        expect(await service.isEnforced()).toBe(true)
        expect(featureFlagService.isEnabled).toHaveBeenCalledTimes(2)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('listByTenant', () => {
    const GUID = '2f1a0b7c-9d3e-4f5a-8b6c-1d2e3f4a5b6c'

    it('resolves the adding user GUID to a display name', async () => {
      safelistRepository.find.mockResolvedValue([
        { id: 'entry-1', recipient: 'qa@gov.bc.ca', createdBy: GUID },
      ])
      notifyUserRepository.find.mockResolvedValue([
        { externalId: GUID, displayName: 'Falk, Barrett CITZ:EX', username: 'bfalk' },
      ])

      const [entry] = await service.listByTenant(TENANT)

      expect(entry.createdByName).toBe('Falk, Barrett CITZ:EX')
    })

    it('falls back to the username when there is no display name', async () => {
      safelistRepository.find.mockResolvedValue([{ id: 'entry-1', createdBy: GUID }])
      notifyUserRepository.find.mockResolvedValue([
        { externalId: GUID, displayName: null, username: 'bfalk' },
      ])

      const [entry] = await service.listByTenant(TENANT)

      expect(entry.createdByName).toBe('bfalk')
    })

    it('returns null rather than exposing a GUID for an unknown user', async () => {
      safelistRepository.find.mockResolvedValue([{ id: 'entry-1', createdBy: GUID }])
      notifyUserRepository.find.mockResolvedValue([])

      const [entry] = await service.listByTenant(TENANT)

      expect(entry.createdByName).toBeNull()
    })

    it('passes through non-GUID markers like the seed user', async () => {
      safelistRepository.find.mockResolvedValue([{ id: 'entry-1', createdBy: 'system' }])

      const [entry] = await service.listByTenant(TENANT)

      expect(entry.createdByName).toBe('system')
      expect(notifyUserRepository.find).not.toHaveBeenCalled()
    })

    it('looks the directory up once for a page of entries', async () => {
      safelistRepository.find.mockResolvedValue([
        { id: 'entry-1', createdBy: GUID },
        { id: 'entry-2', createdBy: GUID },
      ])
      notifyUserRepository.find.mockResolvedValue([{ externalId: GUID, displayName: 'Barrett' }])

      const entries = await service.listByTenant(TENANT)

      expect(notifyUserRepository.find).toHaveBeenCalledTimes(1)
      expect(entries.map((e) => e.createdByName)).toEqual(['Barrett', 'Barrett'])
    })
  })

  describe('add', () => {
    it('stores the value as typed alongside its normalized form', async () => {
      safelistRepository.findOne.mockResolvedValue(null)
      safelistRepository.count.mockResolvedValue(0)

      await service.add(
        TENANT,
        {
          channelCode: NotificationChannel.EMAIL,
          recipient: '  Person@GOV.BC.CA ',
          label: ' QA mailbox ',
        },
        'user-guid',
      )

      expect(safelistRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: 'Person@GOV.BC.CA',
          recipientNormalized: 'person@gov.bc.ca',
          label: 'QA mailbox',
          createdBy: 'user-guid',
        }),
      )
    })

    it('rejects a recipient that is not valid for the channel', async () => {
      await expect(
        service.add(TENANT, {
          channelCode: NotificationChannel.EMAIL,
          recipient: 'not-an-email',
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects a duplicate that differs only by formatting', async () => {
      safelistRepository.findOne.mockResolvedValue({ id: 'existing' })

      await expect(
        service.add(TENANT, {
          channelCode: NotificationChannel.EMAIL,
          recipient: 'PERSON@gov.bc.ca',
        }),
      ).rejects.toBeInstanceOf(ConflictException)
    })

    it('rejects an entry once the cap is reached', async () => {
      safelistRepository.findOne.mockResolvedValue(null)
      configurationRepository.findOne.mockResolvedValue({ config: { value: 2 } })
      safelistRepository.count.mockResolvedValue(2)

      await expect(
        service.add(TENANT, {
          channelCode: NotificationChannel.EMAIL,
          recipient: 'one.more@gov.bc.ca',
        }),
      ).rejects.toThrow('Safelist is full (2 entries)')
    })
  })

  describe('remove', () => {
    it('soft deletes the entry so the audit trail survives', async () => {
      const entry = { id: 'entry-uuid-1', tenantId: TENANT, isDeleted: false, updatedBy: null }
      safelistRepository.findOne.mockResolvedValue(entry)

      await service.remove(TENANT, 'entry-uuid-1', 'user-guid')

      expect(safelistRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: true, updatedBy: 'user-guid' }),
      )
    })

    it('does not remove an entry belonging to another tenant', async () => {
      safelistRepository.findOne.mockResolvedValue(null)

      await expect(service.remove(TENANT, 'someone-elses-entry')).rejects.toBeInstanceOf(
        NotFoundException,
      )
    })
  })

  describe('getMaxEntries', () => {
    it('falls back to the default when the configuration row is missing', async () => {
      configurationRepository.findOne.mockResolvedValue(null)
      expect(await service.getMaxEntries()).toBe(50)
    })

    it('falls back to the default when the configured value is unusable', async () => {
      configurationRepository.findOne.mockResolvedValue({ config: { value: 'lots' } })
      expect(await service.getMaxEntries()).toBe(50)
    })
  })
})
