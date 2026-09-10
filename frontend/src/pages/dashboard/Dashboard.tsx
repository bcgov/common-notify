import { useState, type FC } from 'react'
import NotificationStatusTable from './sections/NotificationStatusTable'
import SearchField from '@/components/SearchField'
import PageHeading from '@/components/PageHeading'

const Dashboard: FC = () => {
  const [searchInput, setSearchInput] = useState<string>('')

  // TODO: wire up notification-event search when it is added.
  const handleSearch = () => {}

  return (
    <div className="page dashboard-page">
      <PageHeading title="Dashboard" />

      <div className="page__toolbar">
        <SearchField
          value={searchInput}
          onChange={setSearchInput}
          onSearch={handleSearch}
          placeholder="Search Notification Events..."
          ariaLabel="Search Notification Events"
        />
      </div>

      <NotificationStatusTable />
    </div>
  )
}

export default Dashboard
