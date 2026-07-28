import { useState, type FC } from 'react'
import NotificationStatusTable from './sections/NotificationStatusTable'
import SearchField from '@/components/SearchField'
import PageHeading from '@/components/PageHeading'

const Dashboard: FC = () => {
  const [searchInput, setSearchInput] = useState<string>('')

  // TODO: wire up notification-event search when it is added
  const handleSearch = () => {}

  return (
    <div className="dashboard-page">
      <PageHeading title="Dashboard" />

      <div className="dashboard-page__search">
        <SearchField
          value={searchInput}
          onChange={setSearchInput}
          onSearch={handleSearch}
          placeholder="Search Notification Events..."
          ariaLabel="Search Notification Events"
        />
      </div>

      <div className="dashboard-page__table">
        <NotificationStatusTable />
      </div>
    </div>
  )
}

export default Dashboard
