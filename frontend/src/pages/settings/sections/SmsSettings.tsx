import { useEffect, useState } from 'react'
import type { FC, SubmitEvent } from 'react'
import { Button, SvgInfoIcon, Switch, Tooltip } from '@bcgov/design-system-react-components'
import TooltipTrigger from '@/components/TooltipTrigger'
import { NotificationChannel } from '@/api/templates.api'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchApiKeyUsage } from '@/redux/thunks/apiKeyUsage.thunks'
import { updateSmsSettings } from '@/redux/thunks/settings.thunks'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import { useCstarRoles } from '@/hooks/useCstarRoles'
import { CstarRole } from '@/enum/cstar-role.enum'
import type { SmsSettingsValues } from '@/interfaces/tenant-settings.interface'

const formatLimit = (limit: number | undefined, unit: 'day' | 'year'): string =>
  limit === undefined ? 'Not set' : `${limit.toLocaleString()} SMS/${unit}`

const SmsSettings: FC = () => {
  const dispatch = useAppDispatch()
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const { usage, isLoading } = useAppSelector((state) => state.apiKeyUsage)
  const {
    smsNotificationsEnabled,
    includeTenantNameInSms,
    internationalSmsEnabled,
    saving,
    error,
  } = useAppSelector((state) => state.smsSettings)
  const smsLimits = usage?.channels.find((channel) => channel.channel === NotificationChannel.SMS)
  const { hasRole } = useCstarRoles()
  const canEdit = hasRole(CstarRole.NOTIFY_OPERATIONS_ADMIN)
  // Seeded once at mount. Settings.tsx remounts this section whenever new data lands,
  // so there is no effect keeping these in sync.
  const [values, setValues] = useState<SmsSettingsValues>({
    smsNotificationsEnabled,
    includeTenantNameInSms,
    internationalSmsEnabled,
  })

  // Read-only daily/annual limits. Remounted per tenant by Settings.tsx.
  useEffect(() => {
    dispatch(fetchApiKeyUsage())
  }, [dispatch])

  // Simple check for whether not a value has changed from the existing value
  const settingsChanged =
    values.smsNotificationsEnabled !== smsNotificationsEnabled ||
    values.includeTenantNameInSms !== includeTenantNameInSms ||
    values.internationalSmsEnabled !== internationalSmsEnabled
  const isSaveDisabled = !canEdit || !settingsChanged || saving
  const isFieldDisabled = saving || !canEdit

  function setValue(key: keyof SmsSettingsValues, isSelected: boolean) {
    setValues((current) => ({ ...current, [key]: isSelected }))
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!settingsChanged || saving) {
      return
    }

    try {
      const updatedSettings = await dispatch(updateSmsSettings(values)).unwrap()
      // Re-sync to exactly what was persisted; the slice moves the baseline.
      setValues({
        smsNotificationsEnabled: updatedSettings.smsNotificationsEnabled,
        includeTenantNameInSms: updatedSettings.includeTenantNameInSms,
        internationalSmsEnabled: updatedSettings.internationalSmsEnabled,
      })
      showSuccessToast('SMS settings updated successfully')
    } catch (updateError) {
      showErrorToast(
        typeof updateError === 'string' ? updateError : 'Failed to update SMS settings',
      )
    }
  }

  return (
    <form className="settings__form" onSubmit={handleSubmit}>
      <h2 className="settings__section-heading">SMS Settings</h2>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="settings__field">
        <div className="settings__switch-row">
          <span className="settings__label">
            SMS notifications
            <TooltipTrigger>
              <Button
                aria-label="About SMS notifications"
                className="settings__info-icon"
                isIconButton
                size="xsmall"
                type="button"
                variant="tertiary"
              >
                <SvgInfoIcon />
              </Button>
              <Tooltip className="bcds-react-aria-Tooltip settings__tooltip" placement="right">
                Switching this off will disable ability to send SMS notifications for this tenant.
              </Tooltip>
            </TooltipTrigger>
          </span>
          <Switch
            aria-label="SMS notifications"
            isDisabled={isFieldDisabled}
            isSelected={values.smsNotificationsEnabled}
            onChange={(isSelected) => setValue('smsNotificationsEnabled', isSelected)}
          />
        </div>
      </div>

      <div className="settings__field">
        <div className="settings__switch-row">
          <span className="settings__label">
            Include tenant name in SMS
            <TooltipTrigger>
              <Button
                aria-label="About including the tenant name in SMS"
                className="settings__info-icon"
                isIconButton
                size="xsmall"
                type="button"
                variant="tertiary"
              >
                <SvgInfoIcon />
              </Button>
              <Tooltip className="bcds-react-aria-Tooltip settings__tooltip" placement="right">
                When enabled, SMS messages start with the tenant name to help recipients identify
                the sender.
              </Tooltip>
            </TooltipTrigger>
          </span>
          <Switch
            aria-label="Include tenant name in SMS"
            isDisabled={isFieldDisabled}
            isSelected={values.includeTenantNameInSms}
            onChange={(isSelected) => setValue('includeTenantNameInSms', isSelected)}
          />
        </div>
        <p className="settings__help">
          Start all SMS notifications with &apos;{selectedTenant?.name}&apos;
        </p>
      </div>

      <div className="settings__field">
        <div className="settings__switch-row">
          <span className="settings__label">International SMS</span>
          <Switch
            aria-label="International SMS"
            isDisabled={isFieldDisabled}
            isSelected={values.internationalSmsEnabled}
            onChange={(isSelected) => setValue('internationalSmsEnabled', isSelected)}
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
              This is the maximum amount of SMS notifications you can send in a day.
            </Tooltip>
          </TooltipTrigger>
        </span>
        <p className="settings__rate-limit-value">
          {isLoading ? 'Loading…' : formatLimit(smsLimits?.dailyLimit, 'day')}
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
              This is the maximum amount of SMS notifications you can send in a year.
            </Tooltip>
          </TooltipTrigger>
        </span>
        <p className="settings__rate-limit-value">
          {isLoading ? 'Loading…' : formatLimit(smsLimits?.annualLimit, 'year')}
        </p>
      </div>

      <Button type="submit" variant="primary" isDisabled={isSaveDisabled}>
        {saving ? 'Saving…' : 'Save SMS settings'}
      </Button>
    </form>
  )
}

export default SmsSettings
