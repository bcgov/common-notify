import { useEffect, useState } from 'react'
import type { FC, FormEvent } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/PageHeading'
import { Alert } from '@/components/Alert'
import SafelistSection from './SafelistSection'
import { ToggleButton, ToggleButtonGroup } from '@bcgov/design-system-react-components'
import Breadcrumb from '@/components/Breadcrumb'
import EmailSettings from './sections/EmailSettings'
import SmsSettings from './sections/SmsSettings'
import TenantSettings from './sections/TenantSettings'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchSettings } from '@/redux/thunks/settings.thunks'
import '@/scss/components/settings.scss'

type SettingsTab = 'tenant' | 'email' | 'sms'

const Settings: FC = () => {
  const dispatch = useAppDispatch()
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const tenantId = selectedTenant?.id
  const [selectedTab, setSelectedTab] = useState<SettingsTab>('tenant')
  const [loadedTenantId, setLoadedTenantId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [prevTenantId, setPrevTenantId] = useState(tenantId)

  // Reset the loaded/error state synchronously during render when the tenant changes,
  // ahead of the fetch effect below.
  if (tenantId !== prevTenantId) {
    setPrevTenantId(tenantId)
    setLoadedTenantId(null)
    setLoadError(null)
  }

  // The page owns the single settings fetch, so every tab reads from one request and
  // switching tabs re-fetches nothing. Sections seed their edit state from the slices at
  // mount, so they must not mount until this resolves.
  useEffect(() => {
    if (!tenantId) return

    let active = true

    dispatch(fetchSettings())
      .unwrap()
      .then(() => {
        if (active) setLoadedTenantId(tenantId)
      })
      .catch((error) => {
        if (active) setLoadError(typeof error === 'string' ? error : 'Failed to load settings')
      })

    return () => {
      active = false
    }
  }, [selectedTenant, dispatch])

  return (
    <div>
      <PageHeading title="Tenant Settings" />

      {selectedTenant && <p className="text-muted mb-3">{selectedTenant.name}</p>}

      {error && (
        <Alert variant="danger" className="mb-3">
          {error}
        </Alert>
      )}

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

      {selectedTenant && <SafelistSection />}
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
  const [shouldShowValidation, setShouldShowValidation] = useState(false)
  const normalizedEmail = normalizeEmail(emailInput)
  const validationError =
    normalizedEmail && !isValidEmail(normalizedEmail) ? 'Enter a valid alert email address' : ''
  const emailError = shouldShowValidation ? validationError : ''
  const isDirty = normalizedEmail !== savedAlertEmail
  const isSaveDisabled = !isDirty || saving || Boolean(emailError)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (validationError) {
      setShouldShowValidation(true)
      return
    }
  }, [tenantId, dispatch])

  // Ensure we have a tenantId and that it is for the current tenant
  const isLoaded = Boolean(tenantId) && loadedTenantId === tenantId

  return (
    <div className="settings">
      <Breadcrumb items={[{ label: 'Home', to: '/dashboard' }, { label: 'Settings' }]} />

      <h1 className="settings__title">{selectedTenant?.name}</h1>

      <div className="settings__tabs">
        <ToggleButtonGroup
          selectionMode="single"
          selectedKeys={[selectedTab]}
          onSelectionChange={(keys) => {
            const [key] = [...keys]
            if (key) {
              setSelectedTab(key as SettingsTab)
            }
          }}
          disallowEmptySelection
        >
          <ToggleButton id="tenant">Tenant Settings</ToggleButton>
          <ToggleButton id="email">Email Settings</ToggleButton>
          <ToggleButton id="sms">SMS Settings</ToggleButton>
        </ToggleButtonGroup>
      </div>

      <section className="settings__section">
        {loadError ? (
          <div className="alert alert-danger">{loadError}</div>
        ) : !isLoaded ? (
          <p className="text-muted">Loading settings...</p>
        ) : (
          <>
            {selectedTab === 'tenant' && <TenantSettings key={tenantId} />}
            {selectedTab === 'email' && <EmailSettings key={tenantId} />}
            {selectedTab === 'sms' && <SmsSettings key={tenantId} />}
          </>
        )}
      </section>
    </div>
  )
}

export default Settings
