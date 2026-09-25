import { useState } from 'react'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'

type UseChannelDeactivationOptions = {
  /** Names the channel in the toast, e.g. "Email". */
  channelLabel: string
  /** Persists the deactivation; rejects if it could not be saved. */
  onDeactivate: () => Promise<void>
  /** Moves the tab's own switch, so it can be put back if the save fails. */
  onActiveChange: (active: boolean) => void
}

/**
 * The "switch this channel off" flow, shared by the email and SMS tabs: confirm, persist
 * immediately, and put the switch back if that fails.
 */
export function useChannelDeactivation({
  channelLabel,
  onDeactivate,
  onActiveChange,
}: UseChannelDeactivationOptions) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)

  async function confirmDeactivate() {
    setIsConfirmOpen(false)
    onActiveChange(false)
    setIsDeactivating(true)

    try {
      await onDeactivate()
      showSuccessToast(
        `${channelLabel} channel deactivated: This channel is no longer active and will not send notifications. Your settings are saved and can be reactivated at any time.`,
      )
    } catch (error) {
      onActiveChange(true)
      showErrorToast(
        `Unable to update channel: ${error instanceof Error ? error.message : 'Something went wrong.'}`,
      )
    } finally {
      setIsDeactivating(false)
    }
  }

  return {
    isConfirmOpen,
    isDeactivating,
    requestDeactivate: () => setIsConfirmOpen(true),
    cancelDeactivate: () => setIsConfirmOpen(false),
    confirmDeactivate,
  }
}
