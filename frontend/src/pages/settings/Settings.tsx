import { useEffect, useState } from 'react'
import type { FC, FormEvent } from 'react'
import {
  Button,
  Link,
  SvgInfoIcon,
  SvgUpRightFromSquareIcon,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@bcgov/design-system-react-components'
import Breadcrumb from '@/components/Breadcrumb'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchTenantSettings, updateTenantSettings } from '@/redux/thunks/tenantSettings.thunks'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import { useCstarRoles } from '@/hooks/useCstarRoles'
import { CstarRole } from '@/enum/cstar-role.enum'
import '@/scss/components/settings.scss'

const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

const normalizeEmail = (value: string): string | null => value.trim() || null

const isValidEmail = (value: string): boolean =>
  value.length <= 254 && !value.includes('..') && EMAIL_PATTERN.test(value)

// Local part (before @gov.bc.ca) of the default sending email address.
const SENDER_EMAIL_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

const normalizeSenderEmail = (value: string): string | null => value.trim() || null

const isValidSenderEmail = (value: string): boolean => SENDER_EMAIL_PATTERN.test(value)

const Settings: FC = () => {
  const dispatch = useAppDispatch()
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const { loading, saving, error } = useAppSelector((state) => state.tenantSettings)
  const { hasRole } = useCstarRoles()
  const canEdit = hasRole(CstarRole.NOTIFY_OPERATIONS_ADMIN)
  const [savedAlertEmail, setSavedAlertEmail] = useState<string | null>(null)
  const [emailInput, setEmailInput] = useState('')
  const [savedSenderEmail, setSavedSenderEmail] = useState<string | null>(null)
  const [senderInput, setSenderInput] = useState('')
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
        const nextSenderEmail = settings?.defaultSenderEmail ?? null
        setSavedSenderEmail(nextSenderEmail)
        setSenderInput(nextSenderEmail ?? '')
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
    <div className="settings">
      <Breadcrumb items={[{ label: 'Home', to: '/dashboard' }, { label: 'Settings' }]} />

      <h1 className="settings__title">{selectedTenant?.name}</h1>

      <div className="settings__tabs">
        <ToggleButtonGroup
          selectionMode="single"
          defaultSelectedKeys={['tenant']}
          disallowEmptySelection
        >
          <ToggleButton id="tenant">Tenant Settings</ToggleButton>
          <ToggleButton id="email">Email Settings</ToggleButton>
          <ToggleButton id="sms">SMS Settings</ToggleButton>
        </ToggleButtonGroup>
      </div>

      <section className="settings__section">
        {error && <div className="alert alert-danger">{error}</div>}

        {loading || loadedTenantId !== selectedTenant?.id ? (
          <p className="text-muted">Loading tenant settings...</p>
        ) : (
          <TenantSettingsForm
            emailInput={emailInput}
            savedAlertEmail={savedAlertEmail}
            senderInput={senderInput}
            savedSenderEmail={savedSenderEmail}
            saving={saving}
            canEdit={canEdit}
            onEmailChange={setEmailInput}
            onSenderChange={setSenderInput}
            onSaved={(alertEmail, defaultSenderEmail) => {
              setSavedAlertEmail(alertEmail)
              setEmailInput(alertEmail ?? '')
              setSavedSenderEmail(defaultSenderEmail)
              setSenderInput(defaultSenderEmail ?? '')
            }}
          />
        )}
      </section>
    </div>
  )
}

function TenantSettingsForm({
  emailInput,
  savedAlertEmail,
  senderInput,
  savedSenderEmail,
  saving,
  canEdit,
  onEmailChange,
  onSenderChange,
  onSaved,
}: {
  emailInput: string
  savedAlertEmail: string | null
  senderInput: string
  savedSenderEmail: string | null
  saving: boolean
  canEdit: boolean
  onEmailChange: (value: string) => void
  onSenderChange: (value: string) => void
  onSaved: (alertEmail: string | null, defaultSenderEmail: string | null) => void
}) {
  const dispatch = useAppDispatch()
  const [shouldShowValidation, setShouldShowValidation] = useState(false)
  // Sending-email validation is captured on Save only, not while typing.
  const [senderError, setSenderError] = useState('')
  const normalizedEmail = normalizeEmail(emailInput)
  const validationError =
    normalizedEmail && !isValidEmail(normalizedEmail) ? 'Enter a valid alert email address' : ''
  const emailError = shouldShowValidation ? validationError : ''
  const normalizedSender = normalizeSenderEmail(senderInput)
  const isDirty = normalizedEmail !== savedAlertEmail || normalizedSender !== savedSenderEmail
  const isSaveDisabled = !canEdit || !isDirty || saving || Boolean(emailError)

  function handleSenderChange(value: string) {
    onSenderChange(value)
    if (senderError) {
      setSenderError('')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    let senderValidationError = ''
    if (!normalizedSender) {
      senderValidationError = 'Enter a default sending email address'
    } else if (!isValidSenderEmail(normalizedSender)) {
      senderValidationError = 'Enter a valid sending email address'
    }
    setSenderError(senderValidationError)

    if (validationError || senderValidationError) {
      setShouldShowValidation(true)
      return
    }

    if (!isDirty || saving) {
      return
    }

    try {
      const updatedSettings = await dispatch(
        updateTenantSettings({ alertEmail: normalizedEmail, defaultSenderEmail: normalizedSender }),
      ).unwrap()
      onSaved(updatedSettings.alertEmail, updatedSettings.defaultSenderEmail)
      setShouldShowValidation(false)
      setSenderError('')
      showSuccessToast('Tenant settings updated successfully')
    } catch (updateError) {
      showErrorToast(
        typeof updateError === 'string' ? updateError : 'Failed to update tenant settings',
      )
    }
  }

  return (
    <form className="settings__form" onSubmit={handleSubmit}>
      <h2 className="settings__section-heading">Tenant Settings</h2>

      <div className="settings__field">
        <span className="settings__label" id="default-sending-email-label">
          Default sending email address
          <span className="settings__info-icon" aria-hidden="true">
            <SvgInfoIcon />
          </span>
          <span className="settings__label-optional">(required)</span>
        </span>
        <TextField
          aria-labelledby="default-sending-email-label"
          aria-describedby="default-sending-email-help"
          iconRight={<span className="settings__field-suffix">@gov.bc.ca</span>}
          isDisabled={saving || !canEdit}
          value={senderInput}
          onChange={handleSenderChange}
          isInvalid={Boolean(senderError)}
          errorMessage={senderError || undefined}
          isRequired
        />
        <p id="default-sending-email-help" className="settings__help">
          Enter the part before &apos;@gov.bc.ca&apos;. Maximum 64 characters. Use letters, numbers,
          periods (.), hypens (-), and underscores (_). No spaces.
        </p>
      </div>

      <div className="settings__field">
        <span className="settings__label">
          API rate limit
          <span className="settings__info-icon" aria-hidden="true">
            <SvgInfoIcon />
          </span>
        </span>
        <p className="settings__rate-limit-value">500 calls/minute</p>
        <Link className="settings__external-link" href="#">
          Request increase limit
          <SvgUpRightFromSquareIcon />
        </Link>
      </div>

      <div className="settings__field">
        <label htmlFor="alert-email" className="settings__label">
          Alert email
        </label>
        <input
          id="alert-email"
          type="email"
          className={`form-control${emailError ? ' is-invalid' : ''}`}
          value={emailInput}
          disabled={saving || !canEdit}
          onChange={(event) => onEmailChange(event.target.value)}
          onBlur={() => {
            if (validationError) {
              setShouldShowValidation(true)
            }
          }}
          aria-describedby={`alert-email-help${emailError ? ' alert-email-error' : ''}`}
          aria-invalid={Boolean(emailError)}
        />
        {emailError && (
          <span id="alert-email-error" className="bcds-react-aria-TextField--Error">
            {emailError}
          </span>
        )}
        <p id="alert-email-help" className="settings__help">
          System and limit alerts for this tenant will be sent to this address. Leave blank to clear
          it.
        </p>
      </div>

      <Button type="submit" variant="primary" isDisabled={isSaveDisabled}>
        {saving ? 'Saving…' : 'Save tenant settings'}
      </Button>
    </form>
  )
}

export default Settings
