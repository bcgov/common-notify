import { useState, type FC } from 'react'
import NotificationStatusTable from './sections/NotificationStatusTable'
import SearchField from '@/components/SearchField'
import PageHeading from '@/components/PageHeading'
import { useAppSelector } from '@/redux/hooks'
import { selectHasNoNotifications } from '@/redux/slices/notification.slice'

const Dashboard: FC = () => {
  const [searchInput, setSearchInput] = useState<string>('')
  const hasNoNotifications = useAppSelector(selectHasNoNotifications)

  // TODO: wire up notification-event search when it is added.
  const handleSearch = () => {}

  return (
    <div className="page dashboard-page">
      <PageHeading title="Dashboard" />

      {!hasNoNotifications && (
        <div className="page__toolbar">
          <SearchField
            value={searchInput}
            onChange={setSearchInput}
            onSearch={handleSearch}
            placeholder="Search Notification Events..."
            ariaLabel="Search Notification Events"
          />
        </div>
      )}

      {/* Shows the no-data card itself, so its fetch and SSE effects stay mounted. */}
      <NotificationStatusTable />
    </div>
  )
}

export default Dashboard
