import type { NotificationRequestDetailService } from '../../api/notification/notification-request-detail.service'
import type { MailMergeJobData } from '../queue.types'

export interface BatchRecipients {
  recipients: NonNullable<MailMergeJobData['recipients']>
  /** Delivered by an earlier attempt at this batch; a retry skips them. */
  alreadySent: Set<string>
}

/**
 * The recipients a merge batch owes, read from its detail rows - written at ingestion with each
 * recipient's params - rather than carried on the job. Jobs queued before that change still carry
 * their recipients, and those are used as they are.
 */
export async function loadBatchRecipients(
  requestDetailService: NotificationRequestDetailService,
  notifyId: string,
  batchId: string,
  carried: MailMergeJobData['recipients'],
): Promise<BatchRecipients> {
  if (carried) {
    return {
      recipients: carried,
      alreadySent: await requestDetailService.findSentAddresses(notifyId, batchId),
    }
  }

  const rows = await requestDetailService.findBatchRecipients(notifyId, batchId)
  return {
    recipients: rows.map(({ address, params }) => ({ address, params })),
    alreadySent: new Set(rows.filter((row) => row.status === 'sent').map((row) => row.address)),
  }
}
