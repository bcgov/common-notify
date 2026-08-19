import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { ToggleButton, ToggleButtonGroup } from '@bcgov/design-system-react-components'
import Breadcrumb from '@/components/Breadcrumb'
import EmailSettings from './sections/EmailSettings'
import SmsSettings from './sections/SmsSettings'
import TenantSettings from './sections/TenantSettings'
import SafelistSection from './SafelistSection'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchSettings } from '@/redux/thunks/settings.thunks'
import { useFeatureFlag } from '@/config/featureFlags/useFeatureFlag'
import '@/scss/components/settings.scss'

type SettingsTab = 'tenant' | 'email' | 'sms' | 'safelist'

const Settings: FC = () => {
  const dispatch = useAppDispatch()
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const tenantId = selectedTenant?.id
  const [selectedTab, setSelectedTab] = useState<SettingsTab>('tenant')
  const safelistEnabled = useFeatureFlag('recipient_safelist', tenantId)
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
  }, [tenantId, dispatch])

  // Ensure we have a tenantId and that it is for the current tenant
  const isLoaded = Boolean(tenantId) && loadedTenantId === tenantId

  // The safelist tab is hidden when the recipient_safelist flag is off (e.g. production).
  // Fall back to the tenant tab so we never sit on a tab that isn't shown.
  const activeTab: SettingsTab =
    selectedTab === 'safelist' && !safelistEnabled ? 'tenant' : selectedTab

  return (
    <div className="settings">
      <Breadcrumb items={[{ label: 'Home', to: '/dashboard' }, { label: 'Settings' }]} />

      <h1 className="settings__title">{selectedTenant?.name}</h1>

      <div className="settings__tabs">
        <ToggleButtonGroup
          selectionMode="single"
          selectedKeys={[activeTab]}
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
          {safelistEnabled && <ToggleButton id="safelist">Recipient Safelist</ToggleButton>}
        </ToggleButtonGroup>
      </div>

      <section className="settings__section">
        {/* The safelist owns its own fetch/loading/error, so it renders independently of the
            shared tenant-settings load below. */}
        {activeTab === 'safelist' ? (
          <SafelistSection key={tenantId} />
        ) : loadError ? (
          <div className="alert alert-danger">{loadError}</div>
        ) : !isLoaded ? (
          <p className="text-muted">Loading settings...</p>
        ) : (
          <>
            {activeTab === 'tenant' && <TenantSettings key={tenantId} />}
            {activeTab === 'email' && <EmailSettings key={tenantId} />}
            {activeTab === 'sms' && <SmsSettings key={tenantId} />}
          </>
        )}
      </section>
    </div>
  )
}

export default Settings
