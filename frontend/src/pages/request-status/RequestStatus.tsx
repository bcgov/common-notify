import { useEffect, useState } from 'react'
import type { FC } from 'react'
import notificationApi from '@/api/notification.api'
import type { NotificationRequestDetail } from '@/interfaces/NotificationRequest'
import { DataTable } from '@/components/DataTable'
import type { TableColumn } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import PageHeading from '@/components/PageHeading'
import { showErrorToast } from '@/redux/utils/toastUtils'
import { ChannelBadge } from '@/components/ChannelBadge'

interface RequestStatusProps {
  notificationRequestId: string
}

const columns: TableColumn<NotificationRequestDetail>[] = [
  {
    key: 'recipientAddress',
    label: 'Recipient',
  },
  {
    key: 'channel',
    label: 'Channel',
    render: (_, row) => <ChannelBadge channels={[row.channel]} />,
  },
  {
    key: 'status',
    label: 'Status',
    render: (_, row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'errorMessage',
    label: 'Failure Reason',
    render: (_, row) => row.errorMessage ?? '-',
  },
]

const RequestStatus: FC<RequestStatusProps> = ({ notificationRequestId }) => {
  const [details, setDetails] = useState<NotificationRequestDetail[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true)
      try {
        const data = await notificationApi.listRequestDetails(notificationRequestId)
        setDetails(data)
      } catch (error) {
        showErrorToast(
          error instanceof Error ? error.message : 'Failed to load notification details',
        )
      } finally {
        setLoading(false)
      }
    }

    fetchDetails()
  }, [notificationRequestId])

  return (
    <div>
      <PageHeading title="Notification Status" />
      {/** add search bar here */}
      <DataTable
        columns={columns}
        data={details}
        keyExtractor={(row) => row.id}
        isLoading={loading}
        emptyMessage="No delivery records found"
        label="Notification Delivery Records"
      />
    </div>
  )
}

export default RequestStatus
