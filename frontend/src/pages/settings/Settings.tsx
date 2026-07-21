import { useEffect, useState } from 'react'
import type { FC, FormEvent } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/PageHeading'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchTenantSettings, updateTenantSettings } from '@/redux/thunks/tenantSettings.thunks'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const normalizeEmail = (value: string): string | null => value.trim() || null

const Settings: FC = () => {
  const dispatch = useAppDispatch()
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const { loading, saving, error } = useAppSelector((state) => state.tenantSettings)
  const [savedAlertEmail, setSavedAlertEmail] = useState<string | null>(null)
  const [emailInput, setEmailInput] = useState('')
  const [loadedTenantId, setLoadedTenantId] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    if (!selectedTenant) {
      return () => {
        active = false
      }
    }

    dispatch(fetchTenantSettings())
      .unwrap()
      .then((settings) => {
        if (!active) return

        const nextAlertEmail = settings?.alertEmail ?? null
        setSavedAlertEmail(nextAlertEmail)
        setEmailInput(nextAlertEmail ?? '')
        setLoadedTenantId(selectedTenant.id)
      })
      .catch(() => {
        if (active) {
          // The slice exposes the load error below; keep a clean empty form available.
          setLoadedTenantId(selectedTenant.id)
        }
      })

    return () => {
      active = false
    }
  }, [selectedTenant, dispatch])

  return (
    <div>
      <PageHeading title="Tenant Settings" />

      {selectedTenant && <p className="text-muted mb-3">{selectedTenant.name}</p>}

      {error && <div className="alert alert-danger mb-3">{error}</div>}

      {loading || loadedTenantId !== selectedTenant?.id ? (
        <p className="text-muted">Loading tenant settings...</p>
      ) : (
        <SettingsForm
          emailInput={emailInput}
          savedAlertEmail={savedAlertEmail}
          saving={saving}
          onEmailChange={setEmailInput}
          onSaved={(alertEmail) => {
            setSavedAlertEmail(alertEmail)
            setEmailInput(alertEmail ?? '')
          }}
        />
      )}
    </div>
  )
}

function SettingsForm({
  emailInput,
  savedAlertEmail,
  saving,
  onEmailChange,
  onSaved,
}: {
  emailInput: string
  savedAlertEmail: string | null
  saving: boolean
  onEmailChange: (value: string) => void
  onSaved: (value: string | null) => void
}) {
  const dispatch = useAppDispatch()
  const normalizedEmail = normalizeEmail(emailInput)
  const emailError =
    normalizedEmail && !EMAIL_PATTERN.test(normalizedEmail)
      ? 'Enter a valid alert email address'
      : ''
  const isDirty = normalizedEmail !== savedAlertEmail
  const isSaveDisabled = !isDirty || saving || Boolean(emailError)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSaveDisabled) {
      return
    }

    try {
      const updatedSettings = await dispatch(
        updateTenantSettings({ alertEmail: normalizedEmail }),
      ).unwrap()
      onSaved(updatedSettings.alertEmail)
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
          className={`form-control${emailError ? ' is-invalid' : ''}`}
          value={emailInput}
          disabled={saving}
          onChange={(event) => onEmailChange(event.target.value)}
          aria-describedby={`alert-email-help${emailError ? ' alert-email-error' : ''}`}
          aria-invalid={Boolean(emailError)}
        />
        {emailError && (
          <span id="alert-email-error" className="bcds-react-aria-TextField--Error">
            {emailError}
          </span>
        )}
        <div id="alert-email-help" className="form-text">
          System and limit alerts for this tenant will be sent to this address. Leave blank to clear
          it.
        </div>
      </div>

      <Button type="submit" variant="primary" isDisabled={isSaveDisabled}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </form>
  )
}

export default Settings
