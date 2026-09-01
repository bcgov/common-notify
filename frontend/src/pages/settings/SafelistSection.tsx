import { useEffect } from 'react'
import type { FC } from 'react'
import { Alert } from '@/components/Alert'
import PageSubHeading from '@/components/PageSubHeading'
import { SafelistForm, SafelistTable } from '@/components/safelist'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import {
  addSafelistEntry,
  fetchSafelist,
  removeSafelistEntry,
} from '@/redux/thunks/safelist.thunks'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import type { CreateSafelistEntry, SafelistEntry } from '@/interfaces/safelist.interface'

/**
 * Recipient safelist ("whitelist") management.
 *
 * The safelist is a non-production guardrail: in PR, DEV and TEST this tenant can only send
 * notifications to the recipients listed here, so a test send can never reach a real person by
 * accident. Production does not enforce it — there the section reads as informational.
 *
 * This component is wiring only; the form and table are reusable pieces under components/safelist.
 */
const SafelistSection: FC = () => {
  const dispatch = useAppDispatch()
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const { entries, enforced, maxEntries, loading, saving, error } = useAppSelector(
    (state) => state.safelist,
  )

  useEffect(() => {
    if (!selectedTenant) return
    dispatch(fetchSafelist())
  }, [selectedTenant, dispatch])

  const isFull = maxEntries > 0 && entries.length >= maxEntries

  async function handleAdd(values: CreateSafelistEntry): Promise<boolean> {
    try {
      await dispatch(addSafelistEntry(values)).unwrap()
      showSuccessToast('Recipient added to the safelist')
      return true
    } catch (addError) {
      showErrorToast(typeof addError === 'string' ? addError : 'Failed to add the recipient')
      return false
    }
  }

  async function handleRemove(entry: SafelistEntry) {
    try {
      await dispatch(removeSafelistEntry(entry.id)).unwrap()
      showSuccessToast(`${entry.recipient} removed from the safelist`)
    } catch (removeError) {
      showErrorToast(
        typeof removeError === 'string' ? removeError : 'Failed to remove the recipient',
      )
    }
  }

  return (
    <section className="mt-5" aria-label="Recipient safelist">
      <PageSubHeading title="Recipient safelist" />

      {!enforced ? (
        // Nothing below this is shown when the safelist has no effect: a list of recipients that
        // does not gate anything invites the reader to believe it does.
        <Alert variant="info">This environment does not enforce the safelist.</Alert>
      ) : (
        <>
          <Alert variant="warning">
            This environment only sends to safelisted recipients. Notifications addressed to anyone
            else are rejected, and a tenant with an empty safelist cannot send at all.
          </Alert>

          {error && <Alert variant="danger">{error}</Alert>}

          <SafelistForm onSubmit={handleAdd} isSubmitting={saving} isFull={isFull} />

          {maxEntries > 0 && (
            <p className="text-muted">
              {entries.length} of {maxEntries} entries used
              {isFull && ' — remove an entry before adding another'}
            </p>
          )}

          <SafelistTable
            entries={entries}
            isLoading={loading}
            isBusy={saving}
            onRemove={handleRemove}
            emptyMessage="No recipients are safelisted. This tenant cannot send any notifications until at least one recipient is added."
          />
        </>
      )}
    </section>
  )
}

export default SafelistSection
