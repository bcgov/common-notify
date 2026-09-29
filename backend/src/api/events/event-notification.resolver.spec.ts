import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { Repository } from 'typeorm'
import { CstarApiClient } from '../../services/cstar/cstar-api.client'
import { EventRecipientKind } from '../../enum/event-recipient-kind.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { NotifyEvent } from './entities/event.entity'
import { EventChannelSetting } from './entities/event-channel-setting.entity'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import { EventNotificationResolver } from './event-notification.resolver'

describe('EventNotificationResolver', () => {
  const eventRepository = { findOne: vi.fn() } as unknown as Repository<NotifyEvent>
  const channelSettingRepository = {
    findOne: vi.fn(),
  } as unknown as Repository<EventChannelSetting>
  const configurationRepository = {
    findOne: vi.fn(),
  } as unknown as Repository<NotifyConfiguration>
  const cstarApiClient = { getGroupMemberEmails: vi.fn() } as unknown as CstarApiClient

  const resolver = new EventNotificationResolver(
    eventRepository,
    channelSettingRepository,
    configurationRepository,
    cstarApiClient,
  )

  const cstar = { tenantId: 'external-tenant-id', authHeader: 'Bearer token' }

  /** An event with one live, active, complete EMAIL channel. */
  const eventWith = (setting: Partial<EventChannelSetting>) =>
    ({
      id: 'event-id',
      channelSettings: [
        {
          channelCode: NotificationChannel.EMAIL,
          isDeleted: false,
          active: true,
          templateId: 'template-id',
          recipients: [],
          cstarGroups: [],
          ...setting,
        },
      ],
    }) as unknown as NotifyEvent

  const recipient = (kind: EventRecipientKind, address: string) => ({
    kind,
    address,
    isDeleted: false,
  })
  const group = (kind: EventRecipientKind, cstarGroupId: string) => ({
    kind,
    cstarGroupId,
    isDeleted: false,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(configurationRepository.findOne).mockResolvedValue({
      config: { value: 100 },
    } as any)
    vi.mocked(cstarApiClient.getGroupMemberEmails).mockResolvedValue([])
  })

  describe('resolveSend', () => {
    it("builds a request from the event's template and addresses", async () => {
      vi.mocked(eventRepository.findOne).mockResolvedValue(
        eventWith({
          recipients: [
            recipient(EventRecipientKind.TO, 'to@gov.bc.ca'),
            recipient(EventRecipientKind.CC, 'cc@gov.bc.ca'),
          ] as any,
        }),
      )

      const result = await resolver.resolveSend('tenant-id', 'event-id', { name: 'Ada' }, cstar)

      expect(result).toEqual({
        params: { name: 'Ada' },
        email: {
          recipients: { to: ['to@gov.bc.ca'], cc: ['cc@gov.bc.ca'] },
          content: { templateId: 'template-id' },
        },
      })
    })

    it('expands CSTAR groups into their members', async () => {
      vi.mocked(eventRepository.findOne).mockResolvedValue(
        eventWith({
          recipients: [recipient(EventRecipientKind.TO, 'named@gov.bc.ca')] as any,
          cstarGroups: [group(EventRecipientKind.TO, 'group-a')] as any,
        }),
      )
      vi.mocked(cstarApiClient.getGroupMemberEmails).mockResolvedValue([
        'member1@gov.bc.ca',
        'member2@gov.bc.ca',
      ])

      const result = await resolver.resolveSend('tenant-id', 'event-id', undefined, cstar)

      // CSTAR identifies tenants by the external ID, not notify's own primary key.
      expect(cstarApiClient.getGroupMemberEmails).toHaveBeenCalledWith(
        'external-tenant-id',
        ['group-a'],
        'Bearer token',
      )
      expect(result.email?.recipients.to).toEqual([
        'named@gov.bc.ca',
        'member1@gov.bc.ca',
        'member2@gov.bc.ca',
      ])
    })

    it('writes someone on two lists only to the more prominent one', async () => {
      vi.mocked(eventRepository.findOne).mockResolvedValue(
        eventWith({
          recipients: [
            recipient(EventRecipientKind.TO, 'both@gov.bc.ca'),
            recipient(EventRecipientKind.CC, 'both@gov.bc.ca'),
            recipient(EventRecipientKind.BCC, 'Both@Gov.BC.ca'),
            recipient(EventRecipientKind.CC, 'cconly@gov.bc.ca'),
          ] as any,
        }),
      )

      const result = await resolver.resolveSend('tenant-id', 'event-id', undefined, cstar)

      expect(result.email?.recipients.to).toEqual(['both@gov.bc.ca'])
      expect(result.email?.recipients.cc).toEqual(['cconly@gov.bc.ca'])
      expect(result.email?.recipients.bcc).toBeUndefined()
    })

    it('enforces the recipient cap on the expanded total', async () => {
      vi.mocked(configurationRepository.findOne).mockResolvedValue({ config: { value: 2 } } as any)
      vi.mocked(eventRepository.findOne).mockResolvedValue(
        eventWith({ cstarGroups: [group(EventRecipientKind.TO, 'group-a')] as any }),
      )
      vi.mocked(cstarApiClient.getGroupMemberEmails).mockResolvedValue([
        'a@gov.bc.ca',
        'b@gov.bc.ca',
        'c@gov.bc.ca',
      ])

      await expect(
        resolver.resolveSend('tenant-id', 'event-id', undefined, cstar),
      ).rejects.toBeInstanceOf(UnprocessableEntityException)
    })

    it('refuses a send whose groups resolved to nobody', async () => {
      vi.mocked(eventRepository.findOne).mockResolvedValue(
        eventWith({ cstarGroups: [group(EventRecipientKind.TO, 'empty-group')] as any }),
      )

      await expect(
        resolver.resolveSend('tenant-id', 'event-id', undefined, cstar),
      ).rejects.toBeInstanceOf(UnprocessableEntityException)
    })

    it('lets a CSTAR failure fail the request', async () => {
      vi.mocked(eventRepository.findOne).mockResolvedValue(
        eventWith({ cstarGroups: [group(EventRecipientKind.TO, 'group-a')] as any }),
      )
      vi.mocked(cstarApiClient.getGroupMemberEmails).mockRejectedValue(new Error('CSTAR is down'))

      // Sending to fewer people than the event was configured for would be worse than not
      // sending at all, so this must not be swallowed.
      await expect(resolver.resolveSend('tenant-id', 'event-id', undefined, cstar)).rejects.toThrow(
        'CSTAR is down',
      )
    })

    it('rejects an unknown event', async () => {
      vi.mocked(eventRepository.findOne).mockResolvedValue(null)

      await expect(
        resolver.resolveSend('tenant-id', 'missing', undefined, cstar),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it.each([
      ['inactive', { active: false }],
      ['without a template', { templateId: null }],
    ])('rejects an event whose email channel is %s', async (_label, setting) => {
      vi.mocked(eventRepository.findOne).mockResolvedValue(
        eventWith({
          ...setting,
          recipients: [recipient(EventRecipientKind.TO, 'to@gov.bc.ca')] as any,
        }),
      )

      await expect(
        resolver.resolveSend('tenant-id', 'event-id', undefined, cstar),
      ).rejects.toBeInstanceOf(UnprocessableEntityException)
    })

    it('rejects an event with no email channel at all', async () => {
      vi.mocked(eventRepository.findOne).mockResolvedValue({
        id: 'event-id',
        channelSettings: [],
      } as unknown as NotifyEvent)

      await expect(
        resolver.resolveSend('tenant-id', 'event-id', undefined, cstar),
      ).rejects.toBeInstanceOf(UnprocessableEntityException)
    })
  })

  describe('resolveTestSend', () => {
    beforeEach(() => {
      vi.mocked(eventRepository.findOne).mockResolvedValue(
        eventWith({ recipients: [recipient(EventRecipientKind.TO, 'event@gov.bc.ca')] as any }),
      )
    })

    it("sends to the caller rather than the event's own recipients", async () => {
      const result = await resolver.resolveTestSend(
        'tenant-id',
        'event-id',
        { name: 'Ada' },
        ['me@gov.bc.ca'],
        'me@gov.bc.ca',
      )

      expect(result).toEqual({
        params: { name: 'Ada' },
        email: {
          recipients: { to: ['me@gov.bc.ca'] },
          content: { templateId: 'template-id' },
        },
      })
      // The event's own recipients must not receive a test.
      expect(JSON.stringify(result)).not.toContain('event@gov.bc.ca')
    })

    it('does not expand CSTAR groups', async () => {
      await resolver.resolveTestSend(
        'tenant-id',
        'event-id',
        undefined,
        ['me@gov.bc.ca'],
        'me@gov.bc.ca',
      )

      expect(cstarApiClient.getGroupMemberEmails).not.toHaveBeenCalled()
    })

    it('refuses an address that is not the caller', async () => {
      await expect(
        resolver.resolveTestSend(
          'tenant-id',
          'event-id',
          undefined,
          ['someone.else@gov.bc.ca'],
          'me@gov.bc.ca',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('matches the caller regardless of case or padding', async () => {
      await expect(
        resolver.resolveTestSend(
          'tenant-id',
          'event-id',
          undefined,
          ['  Me@GOV.bc.ca '],
          'me@gov.bc.ca',
        ),
      ).resolves.toBeDefined()
    })
  })

  describe('findEmailSendSettings', () => {
    it("returns the event's sender and header", async () => {
      vi.mocked(channelSettingRepository.findOne).mockResolvedValue({
        senderEmail: 'permits@gov.bc.ca',
        useCustomHeader: true,
        headerLogoId: 'logo-id',
        headerTitle: 'Permits',
      } as EventChannelSetting)

      await expect(resolver.findEmailSendSettings('event-id')).resolves.toEqual({
        senderEmail: 'permits@gov.bc.ca',
        useCustomHeader: true,
        headerLogoId: 'logo-id',
        headerTitle: 'Permits',
      })
    })

    it('returns null when the event no longer has an email channel', async () => {
      vi.mocked(channelSettingRepository.findOne).mockResolvedValue(null)

      await expect(resolver.findEmailSendSettings('event-id')).resolves.toBeNull()
    })
  })
})
