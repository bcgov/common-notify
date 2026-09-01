import type { FC } from 'react'
import { useAppSelector } from '@/redux/hooks'
import PageHeading from '@/components/PageHeading'
import { NotificationTemplatesSection } from '../dashboard/sections/NotificationTemplatesSection'
import { NotificationStatusSection } from '../dashboard/sections/NotificationStatusSection'

const Homepage: FC = () => {
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  return (
    <div className="page">
      <PageHeading title={selectedTenant ? selectedTenant.name : 'Homepage'} />

      <NotificationTemplatesSection />

      <NotificationStatusSection />
    </div>
  )
}

export default Homepage
