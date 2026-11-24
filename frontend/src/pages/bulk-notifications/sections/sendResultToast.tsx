import type { FC } from 'react'
import { Link } from '@tanstack/react-router'
import { showInfoToast, showSuccessToast } from '@/redux/utils/toastUtils'

export interface SendResult {
  notifyId: string
  recipientCount: number
  /** Present only when the tenant safelist dropped recipients (non-production environments). */
  blockedMessage?: string
  /** An identical batch was sent recently; notifyId is that original send. */
  duplicate?: boolean
}

const StatusLink: FC<{ notifyId: string; children: string }> = ({ notifyId, children }) => (
  <Link to="/request-status/$notificationRequestId" params={{ notificationRequestId: notifyId }}>
    {children}
  </Link>
)

/**
 * What happened after a send, as a toast: how many were queued, anything the safelist dropped,
 * and a link to follow them. A duplicate of a recent batch says so and links to the original.
 * It stays until dismissed, since it holds a link that a timed toast could take away mid-reach.
 */
export function showSendResultToast(result: SendResult) {
  const options = { autoClose: false as const }
  if (result.duplicate) {
    showInfoToast(
      'Already sent',
      <>
        This batch matches one sent recently, so nothing new was sent. See the{' '}
        <StatusLink notifyId={result.notifyId}>original send</StatusLink>.
      </>,
      options,
    )
    return
  }
  const plural = result.recipientCount === 1 ? '' : 's'
  showSuccessToast(
    `${result.recipientCount.toLocaleString()} notification${plural} queued`,
    <>
      {result.blockedMessage && <>{result.blockedMessage.replace(/\.$/, '')}. </>}
      Track delivery on the{' '}
      <StatusLink notifyId={result.notifyId}>notification status page</StatusLink>.
    </>,
    options,
  )
}
