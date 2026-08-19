import { useState } from 'react'
import type { FC, SubmitEvent } from 'react'
import {
  Button,
  Link,
  SvgInfoIcon,
  SvgUpRightFromSquareIcon,
  TextField,
  Tooltip,
  TooltipTrigger,
} from '@bcgov/design-system-react-components'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { updateTenantSettings } from '@/redux/thunks/settings.thunks'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import { useCstarRoles } from '@/hooks/useCstarRoles'
import { CstarRole } from '@/enum/cstar-role.enum'

const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

const normalizeEmail = (value: string): string | null => value.trim() || null

const isValidEmail = (value: string): boolean =>
  value.length <= 254 && !value.includes('..') && EMAIL_PATTERN.test(value)

// Local part (before @gov.bc.ca) of the default sending email address.
const SENDER_EMAIL_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

const normalizeSenderEmail = (value: string): string | null => value.trim() || null

const isValidSenderEmail = (value: string): boolean => SENDER_EMAIL_PATTERN.test(value)

const TenantSettings: FC = () => {
  const dispatch = useAppDispatch()
  const { alertEmail, defaultSenderEmail, saving, error } = useAppSelector(
    (state) => state.tenantSettings,
  )
  const { hasRole } = useCstarRoles()
  const canEdit = hasRole(CstarRole.NOTIFY_OPERATIONS_ADMIN)
  // Seeded once at mount. Settings.tsx remounts this section whenever new data lands,
  // so there is no effect keeping these in sync.
  const [emailInput, setEmailInput] = useState(alertEmail ?? '')
  const [senderInput, setSenderInput] = useState(defaultSenderEmail ?? '')
  const [shouldShowValidation, setShouldShowValidation] = useState(false)
  // Sending-email validation is captured on Save only, not while typing.
  const [senderError, setSenderError] = useState('')

  const normalizedEmail = normalizeEmail(emailInput)
  const validationError =
    normalizedEmail && !isValidEmail(normalizedEmail) ? 'Enter a valid alert email address' : ''
  const emailError = shouldShowValidation ? validationError : ''
  const normalizedSender = normalizeSenderEmail(senderInput)
  // Simple check for whether not a value has changed from the existing value
  const settingsChanged = normalizedEmail !== alertEmail || normalizedSender !== defaultSenderEmail
  const isSaveDisabled = !canEdit || !settingsChanged || saving || Boolean(emailError)

  function handleSenderChange(value: string) {
    setSenderInput(value)
    if (senderError) {
      setSenderError('')
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
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

    if (!settingsChanged || saving) {
      return
    }

    try {
      const updatedSettings = await dispatch(
        updateTenantSettings({ alertEmail: normalizedEmail, defaultSenderEmail: normalizedSender }),
      ).unwrap()
      // Re-sync the inputs to exactly what was persisted; the slice moves the baseline.
      setEmailInput(updatedSettings.alertEmail ?? '')
      setSenderInput(updatedSettings.defaultSenderEmail ?? '')
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

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="settings__field">
        <span className="settings__label">
          <span id="default-sending-email-label">Default sending email address</span>
          <TooltipTrigger>
            <Button
              aria-label="About the default sending email address"
              className="settings__info-icon"
              isIconButton
              size="xsmall"
              type="button"
              variant="tertiary"
            >
              <SvgInfoIcon />
            </Button>
            <Tooltip className="bcds-react-aria-Tooltip settings__tooltip" placement="right">
              This is the tenant-wide default sending email address for all your notifications
              within this tenant. You can choose to set a different one for a specific Notification
              Event in the event settings page. Choose an address that your recipients will easily
              recognize.
            </Tooltip>
          </TooltipTrigger>
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
          maxLength={64}
        />
        <p id="default-sending-email-help" className="settings__help">
          Enter the part before &apos;@gov.bc.ca&apos;. Maximum 64 characters. Use letters, numbers,
          periods (.), hypens (-), and underscores (_). No spaces.
        </p>
      </div>

      <div className="settings__field">
        <span className="settings__label">
          API rate limit
          <TooltipTrigger>
            <Button
              aria-label="About the API rate limit"
              className="settings__info-icon"
              isIconButton
              size="xsmall"
              type="button"
              variant="tertiary"
            >
              <SvgInfoIcon />
            </Button>
            <Tooltip className="bcds-react-aria-Tooltip settings__tooltip--wide" placement="right">
              This is the max API calls per minute for your tenant. Managed by the system.
            </Tooltip>
          </TooltipTrigger>
        </span>
        <p className="settings__rate-limit-value">500 calls/minute</p>
        <Link className="settings__external-link" href="#">
          Request increase limit
          <SvgUpRightFromSquareIcon />
        </Link>
      </div>

      <div className="settings__field">
        <span className="settings__label" id="alert-email-label">
          Alert email
        </span>
        <TextField
          type="email"
          aria-labelledby="alert-email-label"
          aria-describedby="alert-email-help"
          value={emailInput}
          isDisabled={saving || !canEdit}
          onChange={setEmailInput}
          onBlur={() => {
            if (validationError) {
              setShouldShowValidation(true)
            }
          }}
          isInvalid={Boolean(emailError)}
          errorMessage={emailError || undefined}
          maxLength={320}
        />
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

export default TenantSettings
