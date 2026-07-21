import { useEffect, useState } from 'react'
import type { FC, FormEvent } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/PageHeading'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchTenantSettings, updateTenantSettings } from '@/redux/thunks/tenantSettings.thunks'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const Settings: FC = () => {
  const dispatch = useAppDispatch()
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const { alertEmail, loading, saving, error } = useAppSelector((state) => state.tenantSettings)

  useEffect(() => {
    if (selectedTenant) {
      dispatch(fetchTenantSettings())
    }
  }, [selectedTenant, dispatch])

  return (
    <div>
      <PageHeading title="Settings" />

      {error && <div className="alert alert-danger mb-3">{error}</div>}

      {loading ? (
        <p className="text-muted">Loading tenant settings...</p>
      ) : (
        <SettingsForm
          key={`${selectedTenant?.id ?? ''}:${alertEmail ?? ''}`}
          initialAlertEmail={alertEmail}
          saving={saving}
        />
      )}
    </div>
  )
}

function SettingsForm({
  initialAlertEmail,
  saving,
}: {
  initialAlertEmail: string | null
  saving: boolean
}) {
  const dispatch = useAppDispatch()
  const [emailInput, setEmailInput] = useState(initialAlertEmail ?? '')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedEmail = emailInput.trim()
    if (trimmedEmail && !EMAIL_PATTERN.test(trimmedEmail)) {
      showErrorToast('Enter a valid alert email address')
      return
    }

    try {
      await dispatch(updateTenantSettings({ alertEmail: trimmedEmail || null })).unwrap()
      showSuccessToast('Tenant settings updated successfully')
    } catch (updateError) {
      showErrorToast(
        typeof updateError === 'string' ? updateError : 'Failed to update tenant settings',
      )
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-3">
        <label htmlFor="alert-email" className="form-label">
          Alert email
        </label>
        <input
          id="alert-email"
          type="email"
          className="form-control"
          value={emailInput}
          disabled={saving}
          onChange={(event) => setEmailInput(event.target.value)}
          aria-describedby="alert-email-help"
        />
        <div id="alert-email-help" className="form-text">
          System and limit alerts for this tenant will be sent to this address. Leave blank to clear
          it.
        </div>
      </div>

      <Button type="submit" variant="primary" isDisabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </form>
  )
}

export default Settings
