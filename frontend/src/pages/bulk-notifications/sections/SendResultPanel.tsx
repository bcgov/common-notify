import type { FC } from 'react'
import { Link } from '@tanstack/react-router'

export interface SendResult {
  notifyId: string
  recipientCount: number
  /** Present only when the tenant safelist dropped recipients (non-production environments). */
  blockedRecipientCount?: number
  blockedMessage?: string
}

interface Props {
  result: SendResult
}

/**
 * What happened after a send: how many went to the queue, anything the safelist dropped, and the
 * way to follow them.
 *
 * `role="status"` because the send happens without navigating - the outcome has to announce itself.
 */
const SendResultPanel: FC<Props> = ({ result }) => (
  <div className="bulk-notifications__result" role="status">
    <h2 className="bulk-notifications__result-title">
      {result.recipientCount.toLocaleString()} notification
      {result.recipientCount === 1 ? '' : 's'} queued
    </h2>
    {result.blockedMessage && (
      <p className="bulk-notifications__result-blocked">{result.blockedMessage}</p>
    )}
    <p>
      Track delivery on the{' '}
      <Link
        to="/request-status/$notificationRequestId"
        params={{ notificationRequestId: result.notifyId }}
      >
        notification status page
      </Link>
      .
    </p>
  </div>
)

export default SendResultPanel
