import { useState } from 'react'
import type { FC } from 'react'
import { ToggleButton, ToggleButtonGroup } from '@bcgov/design-system-react-components'
import Breadcrumb from '@/components/Breadcrumb'
import EmailSettings from './sections/EmailSettings'
import SmsSettings from './sections/SmsSettings'
import TenantSettings from './sections/TenantSettings'
import { useAppSelector } from '@/redux/hooks'
import '@/scss/components/settings.scss'

type SettingsTab = 'tenant' | 'email' | 'sms'

const Settings: FC = () => {
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const [selectedTab, setSelectedTab] = useState<SettingsTab>('tenant')

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
        {selectedTab === 'tenant' && <TenantSettings />}
        {selectedTab === 'email' && <EmailSettings />}
        {selectedTab === 'sms' && <SmsSettings />}
      </section>
    </div>
  )
}

export default Settings
