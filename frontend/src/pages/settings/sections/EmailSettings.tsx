import { useEffect, useState } from 'react'
import type { FC, SubmitEvent } from 'react'
import {
  Button,
  SvgInfoIcon,
  Switch,
  TextField,
  Tooltip,
  TooltipTrigger,
} from '@bcgov/design-system-react-components'
import { NotificationChannel } from '@/api/templates.api'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchApiKeyUsage } from '@/redux/thunks/apiKeyUsage.thunks'
import { updateEmailSettings } from '@/redux/thunks/settings.thunks'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import { useCstarRoles } from '@/hooks/useCstarRoles'
import { CstarRole } from '@/enum/cstar-role.enum'

// Not set appears if a tenant hasn't been bound to the api key
const formatLimit = (limit: number | undefined, unit: 'day' | 'year'): string =>
  limit === undefined ? 'Not set' : `${limit.toLocaleString()} emails/${unit}`

// Local part (before @gov.bc.ca) of the reply to email address.
const REPLY_TO_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

const normalizeReplyTo = (value: string): string | null => value.trim() || null

const isValidReplyTo = (value: string): boolean => REPLY_TO_PATTERN.test(value)

interface EmailSwitches {
  emailNotificationsEnabled: boolean
  emailAttachmentsEnabled: boolean
}

const EmailSettings: FC = () => {
  const dispatch = useAppDispatch()
  const { usage, isLoading } = useAppSelector((state) => state.apiKeyUsage)
  const {
    emailLogoId,
    emailNotificationsEnabled,
    replyToEmail,
    emailAttachmentsEnabled,
    saving,
    error,
  } = useAppSelector((state) => state.emailSettings)
  const emailLimits = usage?.channels.find(
    (channel) => channel.channel === NotificationChannel.EMAIL,
  )
  const { hasRole } = useCstarRoles()
  const canEdit = hasRole(CstarRole.NOTIFY_OPERATIONS_ADMIN)
  // Seeded once at mount. Settings.tsx remounts this section whenever new data lands,
  // so there is no effect keeping these in sync.
  const [switches, setSwitches] = useState<EmailSwitches>({
    emailNotificationsEnabled,
    emailAttachmentsEnabled,
  })
  const [replyToInput, setReplyToInput] = useState(replyToEmail ?? '')
  const [shouldShowValidation, setShouldShowValidation] = useState(false)

  // Read-only daily/annual limits. Remounted per tenant by Settings.tsx.
  useEffect(() => {
    dispatch(fetchApiKeyUsage())
  }, [dispatch])

  const normalizedReplyTo = normalizeReplyTo(replyToInput)
  const validationError =
    normalizedReplyTo && !isValidReplyTo(normalizedReplyTo)
      ? 'Enter a valid reply to email address'
      : ''
  const replyToError = shouldShowValidation ? validationError : ''

  // Simple check for whether not a value has changed from the existing value
  const settingsChanged =
    switches.emailNotificationsEnabled !== emailNotificationsEnabled ||
    switches.emailAttachmentsEnabled !== emailAttachmentsEnabled ||
    normalizedReplyTo !== replyToEmail
  const isSaveDisabled = !canEdit || !settingsChanged || saving || Boolean(validationError)
  const isFieldDisabled = saving || !canEdit

  function setSwitch(key: keyof EmailSwitches, isSelected: boolean) {
    setSwitches((current) => ({ ...current, [key]: isSelected }))
  }

  function handleReplyToChange(value: string) {
    setReplyToInput(value)
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()

    if (validationError) {
      setShouldShowValidation(true)
      return
    }

    if (!settingsChanged || saving) {
      return
    }

    try {
      const updatedSettings = await dispatch(
        updateEmailSettings({ ...switches, emailLogoId, replyToEmail: normalizedReplyTo }),
      ).unwrap()
      // Re-sync to exactly what was persisted; the slice moves the baseline.
      setSwitches({
        emailNotificationsEnabled: updatedSettings.emailNotificationsEnabled,
        emailAttachmentsEnabled: updatedSettings.emailAttachmentsEnabled,
      })
      setReplyToInput(updatedSettings.replyToEmail ?? '')
      setShouldShowValidation(false)
      showSuccessToast('Email settings updated successfully')
    } catch (updateError) {
      showErrorToast(
        typeof updateError === 'string' ? updateError : 'Failed to update email settings',
      )
    }
  }

  return (
    <form className="settings__form" onSubmit={handleSubmit}>
      <h2 className="settings__section-heading">Email Settings</h2>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="settings__field">
        <div className="settings__switch-row">
          <span className="settings__label">
            Email notifications
            <TooltipTrigger>
              <Button
                aria-label="About email notifications"
                className="settings__info-icon"
                isIconButton
                size="xsmall"
                type="button"
                variant="tertiary"
              >
                <SvgInfoIcon />
              </Button>
              <Tooltip className="bcds-react-aria-Tooltip settings__tooltip" placement="right">
                Switching this off will disable ability to send email notifications for this tenant.
              </Tooltip>
            </TooltipTrigger>
          </span>
          <Switch
            aria-label="Email notifications"
            isDisabled={isFieldDisabled}
            isSelected={switches.emailNotificationsEnabled}
            onChange={(isSelected) => setSwitch('emailNotificationsEnabled', isSelected)}
          />
        </div>
      </div>

      <div className="settings__field">
        <span className="settings__label" id="reply-to-email-label">
          Reply to address
        </span>
        <TextField
          aria-labelledby="reply-to-email-label"
          aria-describedby="reply-to-email-help"
          iconRight={<span className="settings__field-suffix">@gov.bc.ca</span>}
          isDisabled={isFieldDisabled}
          value={replyToInput}
          onChange={handleReplyToChange}
          onBlur={() => {
            if (validationError) {
              setShouldShowValidation(true)
            }
          }}
          isInvalid={Boolean(replyToError)}
          errorMessage={replyToError || undefined}
          maxLength={64}
          // Workaround to get placeholder to work with BCDS TextField
          {...({ placeholder: 'Enter a reply to email address' } as { placeholder: string })}
        />
        <p id="reply-to-email-help" className="settings__help">
          Optional. If provided, replies to emails sent from this tenant will be directed to this
          address by default. Can be overridden at the event level.
        </p>
      </div>

      <div className="settings__field">
        <div className="settings__switch-row">
          <span className="settings__label">
            Allow email attachments
            <TooltipTrigger>
              <Button
                aria-label="About allowing email attachments"
                className="settings__info-icon"
                isIconButton
                size="xsmall"
                type="button"
                variant="tertiary"
              >
                <SvgInfoIcon />
              </Button>
              <Tooltip className="bcds-react-aria-Tooltip settings__tooltip" placement="right">
                Allow files to be included as attachments in outgoing emails.
              </Tooltip>
            </TooltipTrigger>
          </span>
          <Switch
            aria-label="Allow email attachments"
            isDisabled={isFieldDisabled}
            isSelected={switches.emailAttachmentsEnabled}
            onChange={(isSelected) => setSwitch('emailAttachmentsEnabled', isSelected)}
          />
        </div>
      </div>

      <div className="settings__field">
        <span className="settings__label">
          Daily limit
          <TooltipTrigger>
            <Button
              aria-label="About the daily limit"
              className="settings__info-icon"
              isIconButton
              size="xsmall"
              type="button"
              variant="tertiary"
            >
              <SvgInfoIcon />
            </Button>
            <Tooltip className="bcds-react-aria-Tooltip settings__tooltip" placement="right">
              This is the maximum amount of email notifications you can send in a day.
            </Tooltip>
          </TooltipTrigger>
        </span>
        <p className="settings__rate-limit-value">
          {isLoading ? 'Loading…' : formatLimit(emailLimits?.dailyLimit, 'day')}
        </p>
      </div>

      <div className="settings__field">
        <span className="settings__label">
          Annual limit
          <TooltipTrigger>
            <Button
              aria-label="About the annual limit"
              className="settings__info-icon"
              isIconButton
              size="xsmall"
              type="button"
              variant="tertiary"
            >
              <SvgInfoIcon />
            </Button>
            <Tooltip className="bcds-react-aria-Tooltip settings__tooltip" placement="right">
              This is the maximum amount of email notifications you can send in a year.
            </Tooltip>
          </TooltipTrigger>
        </span>
        <p className="settings__rate-limit-value">
          {isLoading ? 'Loading…' : formatLimit(emailLimits?.annualLimit, 'year')}
        </p>
      </div>

      <Button type="submit" variant="primary" isDisabled={isSaveDisabled}>
        {saving ? 'Saving…' : 'Save email settings'}
      </Button>
    </form>
  )
}

export default EmailSettings
