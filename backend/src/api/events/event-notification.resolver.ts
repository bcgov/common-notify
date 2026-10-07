import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { NotifyEvent } from './entities/event.entity'
import { EventChannelSetting } from './entities/event-channel-setting.entity'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import { CstarApiClient } from '../../services/cstar/cstar-api.client'
import { EventRecipientKind } from '../../enum/event-recipient-kind.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import type { CstarRequestContext } from './events.service'
import type { NotifySimpleRequest } from '../notify/schemas/notify-simple-request'

/** Global cap on recipients per channel, seeded by V62. Mirrors EventsService. */
const MAX_RECIPIENTS_KEY = 'event_max_recipients'
const DEFAULT_MAX_RECIPIENTS = 100

/**
 * Who a test send is addressed to: a plain list, or merge rows carrying a value set per row.
 * A merge row's values override `params`, which is how each recipient gets a different message.
 */
export type TestRecipients = { to: string[] } | { mergeArray: string[][] }

/** The pieces of an event's email settings the delivery worker reads back at send time. */
export interface EventEmailSendSettings {
  senderEmail: string | null
  useCustomHeader: boolean
  headerLogoId: string | null
  headerTitle: string | null
}

/**
 * Turns an event into a notification request.
 *
 * An event names a template, a sender, a header and a set of recipients; the send pipeline takes
 * a NotifySimpleRequest. This resolves one into the other so that everything downstream of the
 * @Queueable decorator - validation, limits, the queue, the workers - handles an event send with
 * no knowledge that an event was involved.
 *
 * It runs at accept time in order to expand any existing CSTAR groups into recipient emails.
 *
 * Kept apart from EventsService, which is about configuring events rather than sending them, so
 * that the queue module can read an event's send settings without pulling in the CSTAR, logo and
 * template dependencies that the configuration surface needs.
 */
@Injectable()
export class EventNotificationResolver {
  private readonly logger = new Logger(EventNotificationResolver.name)

  constructor(
    @InjectRepository(NotifyEvent)
    private readonly eventRepository: Repository<NotifyEvent>,
    @InjectRepository(EventChannelSetting)
    private readonly channelSettingRepository: Repository<EventChannelSetting>,
    @InjectRepository(NotifyConfiguration)
    private readonly configurationRepository: Repository<NotifyConfiguration>,
    private readonly cstarApiClient: CstarApiClient,
  ) {}

  /**
   * Full send: uses recipients that are saved to the event.
   */
  async resolveSend(
    tenantId: string,
    eventId: string,
    params: Record<string, unknown> | undefined,
    cstar: CstarRequestContext,
  ): Promise<NotifySimpleRequest> {
    const setting = await this.findSendableEmailSetting(tenantId, eventId)

    const to = await this.recipientsOfKind(setting, EventRecipientKind.TO, cstar)
    const cc = await this.recipientsOfKind(setting, EventRecipientKind.CC, cstar)
    const bcc = await this.recipientsOfKind(setting, EventRecipientKind.BCC, cstar)

    // Someone can sit in a typed-in address and in a group, or in two groups addressed by
    // different lists. They should be written to once, on the most prominent list that names
    // them - being on To and Bcc is a contradiction, and To is the one the event meant.
    const seen = new Set<string>()
    const dedupe = (addresses: string[]): string[] =>
      addresses.filter((address) => {
        const key = address.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

    const recipients = { to: dedupe(to), cc: dedupe(cc), bcc: dedupe(bcc) }
    const total = recipients.to.length + recipients.cc.length + recipients.bcc.length

    if (total === 0) {
      throw new UnprocessableEntityException(
        'This event has no recipients to send to. Its CSTAR groups resolved to nobody.',
      )
    }

    // The save-time cap deliberately counts only typed-in addresses, because how many people a
    // group stands for is unknowable then. Here it is known, so this is where the cap means
    // something.
    const maxRecipients = await this.getMaxRecipients()
    if (total > maxRecipients) {
      throw new UnprocessableEntityException(
        `This event resolves to ${total} recipients, over the limit of ${maxRecipients}.`,
      )
    }

    return this.toRequest(setting, params, recipients)
  }

  /**
   * Test send: sent to specific recipients that have been verified.
   */
  async resolveTestSend(
    tenantId: string,
    eventId: string,
    params: Record<string, unknown> | undefined,
    recipients: TestRecipients,
  ): Promise<NotifySimpleRequest> {
    const setting = await this.findSendableEmailSetting(tenantId, eventId)

    if ('mergeArray' in recipients) {
      const [header, ...rows] = recipients.mergeArray
      // Guaranteed present by the mergeArray validator on the request.
      const toColumn = header.findIndex((column) => column.trim().toLowerCase() === 'to')
      const permitted = new Set(this.verifyTestRecipients(rows.map((row) => row[toColumn])))

      return this.toRequest(setting, params, {
        mergeArray: [header, ...rows.filter((row) => permitted.has(row[toColumn]))],
      })
    }

    return this.toRequest(setting, params, { to: this.verifyTestRecipients(recipients.to) })
  }

  /**
   * The event's sender and header, for the delivery worker. Returns null when the request was
   * not event-sourced or the event has since been deleted, which leaves the tenant defaults in
   * place rather than failing the send.
   */
  async findEmailSendSettings(eventId: string): Promise<EventEmailSendSettings | null> {
    const setting = await this.channelSettingRepository.findOne({
      where: {
        eventId,
        channelCode: NotificationChannel.EMAIL,
        isDeleted: false,
      },
    })

    if (!setting) return null

    return {
      senderEmail: setting.senderEmail,
      useCustomHeader: setting.useCustomHeader,
      headerLogoId: setting.headerLogoId,
      headerTitle: setting.headerTitle,
    }
  }

  /**
   * The addresses a test notification may be sent to, design around
   * is TBD so this is just a passthrough right now.
   */
  private verifyTestRecipients(addresses: string[]): string[] {
    return addresses
  }

  /** The event's live EMAIL channel setting, or the reason it cannot be sent. */
  private async findSendableEmailSetting(
    tenantId: string,
    eventId: string,
  ): Promise<EventChannelSetting> {
    const event = await this.eventRepository.findOne({
      where: { id: eventId, tenantId, isDeleted: false },
      relations: ['channelSettings', 'channelSettings.recipients', 'channelSettings.cstarGroups'],
    })

    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found`)
    }

    const setting = (event.channelSettings ?? []).find(
      (candidate) => candidate.channelCode === NotificationChannel.EMAIL && !candidate.isDeleted,
    )

    if (!setting) {
      throw new UnprocessableEntityException(
        'This event has no email notification settings to send with.',
      )
    }

    if (!setting.active) {
      throw new UnprocessableEntityException('This event’s email notification is not active.')
    }

    if (!setting.templateId) {
      throw new UnprocessableEntityException('This event has no template to send.')
    }

    return setting
  }

  /** One list's typed-in addresses, plus the members of every CSTAR group it addresses. */
  private async recipientsOfKind(
    setting: EventChannelSetting,
    kind: EventRecipientKind,
    cstar: CstarRequestContext,
  ): Promise<string[]> {
    const addresses = (setting.recipients ?? [])
      .filter((recipient) => !recipient.isDeleted && recipient.kind === kind)
      .map((recipient) => recipient.address)

    const groupIds = (setting.cstarGroups ?? [])
      .filter((group) => !group.isDeleted && group.kind === kind)
      .map((group) => group.cstarGroupId)

    if (groupIds.length === 0) return addresses

    // Deliberately not caught: sending to fewer people than the event was configured for is
    // worse than not sending, so a CSTAR failure fails the request.
    const members = await this.cstarApiClient.getGroupMemberEmails(
      cstar.tenantId,
      groupIds,
      cstar.authHeader,
    )

    this.logger.debug(
      `Resolved ${groupIds.length} CSTAR group(s) for ${kind} to ${members.length} address(es)`,
    )

    return [...addresses, ...members]
  }

  /** The shape the send pipeline takes. */
  private toRequest(
    setting: EventChannelSetting,
    params: Record<string, unknown> | undefined,
    recipients: { to: string[]; cc?: string[]; bcc?: string[] } | { mergeArray: string[][] },
  ): NotifySimpleRequest {
    return {
      params,
      email: {
        recipients:
          'mergeArray' in recipients
            ? { mergeArray: recipients.mergeArray }
            : {
                to: recipients.to,
                ...(recipients.cc?.length ? { cc: recipients.cc } : {}),
                ...(recipients.bcc?.length ? { bcc: recipients.bcc } : {}),
              },
        // The sender and the header are not carried here: they have no home on this schema, and
        // adding one would expose them on the public send routes that share it. The request
        // records its event instead, and the delivery worker reads them back from that.
        content: { templateId: setting.templateId as string },
      },
    } as NotifySimpleRequest
  }

  /**
   * Global recipient cap from notify.configuration, seeded by V62. An unreadable or nonsensical
   * value falls back to the default rather than failing the send, matching EventsService.
   */
  private async getMaxRecipients(): Promise<number> {
    try {
      const row = await this.configurationRepository.findOne({ where: { key: MAX_RECIPIENTS_KEY } })
      const value = Number(row?.config?.value)
      return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_RECIPIENTS
    } catch (error) {
      this.logger.warn(
        `Failed to read ${MAX_RECIPIENTS_KEY} configuration, using default ${DEFAULT_MAX_RECIPIENTS}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return DEFAULT_MAX_RECIPIENTS
    }
  }
}
