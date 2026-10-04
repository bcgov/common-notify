import { NotificationChannel } from '../enum/notification-channel.enum'
import type { NotifySimpleRequest } from '../api/notify/schemas/notify-simple-request'
import type { MailMergeJobData } from './queue.types'

/** NotificationService.parseMailMergeRecipients, passed in so this stays a plain function. */
export type ParseMergeRecipients = (
  mergeArray: string[][],
  channel: NotificationChannel,
) => Array<{ address: string; params: Record<string, unknown> }>

/**
 * Detect a mail-merge payload: a channel whose recipients use `mergeArray`. The global
 * ValidationPipe has already validated the body, so the presence of `recipients.mergeArray` is
 * sufficient to route the request through the mail merge fan-out flow.
 */
export function mergeRequestChannel(payload: unknown): NotificationChannel | null {
  const request = payload as NotifySimpleRequest | undefined
  if (Array.isArray(request?.email?.recipients?.mergeArray)) return NotificationChannel.EMAIL
  if (Array.isArray(request?.sms?.recipients?.mergeArray)) return NotificationChannel.SMS
  return null
}

/**
 * The parts of a merge every batch shares - content and global params - without parsing its
 * recipient list, which for a large merge is the expensive part.
 */
export function mergeContentFromRequest(
  payload: unknown,
  channel: NotificationChannel,
): Pick<MailMergeJobData, 'content' | 'params'> {
  const request = payload as NotifySimpleRequest
  const channelPayload = channel === NotificationChannel.SMS ? request?.sms : request?.email
  if (!channelPayload || !Array.isArray(channelPayload.recipients?.mergeArray)) {
    throw new Error(`Stored request is not a ${channel} merge`)
  }
  return {
    content: channelPayload.content as MailMergeJobData['content'],
    params: { ...request.params, ...channelPayload.params },
  }
}

/**
 * Rebuild a merge's job data from the request as accepted, which notification_request.payload
 * stores in full. Postgres, not the job, is the record of a send, so anything Redis loses - a
 * failed batch, a job never queued - can be recreated from it.
 *
 * `keep` narrows the recipients - to one batch's, or to those the safelist did not block at
 * acceptance; the rest of a merge's shape (content, global params) is shared.
 */
export function mergeJobDataFromRequest(
  payload: unknown,
  channel: NotificationChannel,
  parseRecipients: ParseMergeRecipients,
  keep?: (address: string) => boolean,
): MailMergeJobData {
  const request = payload as NotifySimpleRequest
  const channelPayload = channel === NotificationChannel.SMS ? request?.sms : request?.email
  const mergeArray = channelPayload?.recipients?.mergeArray
  if (!channelPayload || !Array.isArray(mergeArray)) {
    throw new Error(`Stored request is not a ${channel} merge`)
  }

  const recipients = parseRecipients(mergeArray, channel)
  return {
    content: channelPayload.content as MailMergeJobData['content'],
    params: { ...request.params, ...channelPayload.params },
    recipients: keep ? recipients.filter(({ address }) => keep(address)) : recipients,
  }
}
