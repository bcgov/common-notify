import { useEffect, useState } from 'react'
import type { FC, FormEvent } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import {
  addSafelistEntry,
  fetchSafelist,
  removeSafelistEntry,
} from '@/redux/thunks/safelist.thunks'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import type { SafelistChannel } from '@/interfaces/safelist.interface'

const CHANNEL_LABELS: Record<SafelistChannel, string> = {
  EMAIL: 'Email',
  SMS: 'SMS',
}

/**
 * Recipient safelist ("whitelist") management.
 *
 * The safelist is a non-production guardrail: in PR, DEV and TEST this tenant can only send
 * notifications to the recipients listed here, so a test send can never reach a real person by
 * accident. Production does not enforce it — there the section reads as informational.
 */
const SafelistSection: FC = () => {
  const dispatch = useAppDispatch()
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const { entries, enforced, maxEntries, loading, saving, error } = useAppSelector(
    (state) => state.safelist,
  )

  const [channelCode, setChannelCode] = useState<SafelistChannel>('EMAIL')
  const [recipient, setRecipient] = useState('')
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (!selectedTenant) return
    dispatch(fetchSafelist())
  }, [selectedTenant, dispatch])

  const isFull = maxEntries > 0 && entries.length >= maxEntries
  const canSubmit = recipient.trim().length > 0 && !saving && !isFull

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    try {
      await dispatch(
        addSafelistEntry({
          channelCode,
          recipient: recipient.trim(),
          label: label.trim() || null,
        }),
      ).unwrap()
      setRecipient('')
      setLabel('')
      showSuccessToast('Recipient added to the safelist')
    } catch (addError) {
      showErrorToast(typeof addError === 'string' ? addError : 'Failed to add the recipient')
    }
  }

  async function handleRemove(id: string, displayValue: string) {
    try {
      await dispatch(removeSafelistEntry(id)).unwrap()
      showSuccessToast(`${displayValue} removed from the safelist`)
    } catch (removeError) {
      showErrorToast(
        typeof removeError === 'string' ? removeError : 'Failed to remove the recipient',
      )
    }
  }

  return (
    <section className="mt-5" aria-labelledby="safelist-heading">
      <h2 id="safelist-heading" className="h4">
        Recipient safelist
      </h2>

      {enforced ? (
        <div className="alert alert-warning" role="status">
          This environment only sends to safelisted recipients. Notifications addressed to anyone
          else are rejected, and a tenant with an empty safelist cannot send at all.
        </div>
      ) : (
        <div className="alert alert-info" role="status">
          This environment does not enforce the safelist — notifications are sent to whoever they
          are addressed to. The list below applies in test environments.
        </div>
      )}

      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleAdd} className="row g-2 align-items-end mb-3">
        <div className="col-12 col-md-2">
          <label htmlFor="safelist-channel" className="form-label">
            Channel
          </label>
          <select
            id="safelist-channel"
            className="form-select"
            value={channelCode}
            disabled={saving}
            onChange={(event) => setChannelCode(event.target.value as SafelistChannel)}
          >
            <option value="EMAIL">Email</option>
            <option value="SMS">SMS</option>
          </select>
        </div>

        <div className="col-12 col-md-4">
          <label htmlFor="safelist-recipient" className="form-label">
            {channelCode === 'EMAIL' ? 'Email address' : 'Phone number'}
          </label>
          <input
            id="safelist-recipient"
            className="form-control"
            value={recipient}
            disabled={saving}
            placeholder={channelCode === 'EMAIL' ? 'name@gov.bc.ca' : '(250) 555-0100'}
            onChange={(event) => setRecipient(event.target.value)}
          />
        </div>

        <div className="col-12 col-md-4">
          <label htmlFor="safelist-label" className="form-label">
            Label (optional)
          </label>
          <input
            id="safelist-label"
            className="form-control"
            value={label}
            disabled={saving}
            placeholder="QA mailbox"
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>

        <div className="col-12 col-md-2">
          <Button type="submit" variant="primary" isDisabled={!canSubmit}>
            {saving ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </form>

      {maxEntries > 0 && (
        <p className="text-muted">
          {entries.length} of {maxEntries} entries used
          {isFull && ' — remove an entry before adding another'}
        </p>
      )}

      {loading ? (
        <p className="text-muted">Loading safelist...</p>
      ) : entries.length === 0 ? (
        <p className="text-muted">
          No recipients are safelisted. {enforced && 'This tenant cannot send any notifications '}
          {enforced && 'until at least one recipient is added.'}
        </p>
      ) : (
        <table className="table">
          <caption className="visually-hidden">
            Recipients this tenant is permitted to send to
          </caption>
          <thead>
            <tr>
              <th scope="col">Channel</th>
              <th scope="col">Recipient</th>
              <th scope="col">Label</th>
              <th scope="col">Added by</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{CHANNEL_LABELS[entry.channelCode] ?? entry.channelCode}</td>
                <td>{entry.recipient}</td>
                <td>{entry.label ?? '—'}</td>
                <td>{entry.createdBy ?? '—'}</td>
                <td>
                  <Button
                    variant="secondary"
                    isDisabled={saving}
                    onPress={() => handleRemove(entry.id, entry.recipient)}
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export default SafelistSection
