import { useEffect, useState } from 'react'
import type { FC } from 'react'
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

  // The page owns the single settings fetch, so every tab reads from one request and
  // switching tabs re-fetches nothing. Sections seed their edit state from the slices at
  // mount, so they must not mount until this resolves.
  useEffect(() => {
    if (!tenantId) return

    let active = true
    setLoadedTenantId(null)
    setLoadError(null)

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
