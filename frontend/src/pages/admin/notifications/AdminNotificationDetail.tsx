import type { FC, ReactNode } from 'react'
import { Link } from '@bcgov/design-system-react-components'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import type { AdminDelivery, AdminNotificationDetail as Detail } from '@/api/adminNotifications.api'
import PageHeading from '@/components/PageHeading'
import PageSubHeading from '@/components/PageSubHeading'
import Alert from '@/components/Alert'
import { DataTable } from '@/components/DataTable'
import type { TableColumn } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { ChannelBadge } from '@/components/ChannelBadge'
import { formatChannel } from '@/utils/usage'
import { useAdminDeliveries, useAdminNotification } from './useAdminNotificationDetail'
import { CHANNEL_FILTER_OPTIONS, formatDateTime } from './adminNotificationFormat'
import '@/scss/components/admin-notifications.scss'

const DELIVERY_STATUS_OPTIONS = [
  { label: 'Pending', value: 'pending' },
  { label: 'Sent', value: 'sent' },
  { label: 'Failed', value: 'failed' },
]

/** Error text keeps its line breaks and wraps long tokens such as JSON. */
const ErrorText: FC<{ text: string | null }> = ({ text }) =>
  text ? <pre className="admin-notification__error-text">{text}</pre> : <>-</>

const deliveryColumns: TableColumn<AdminDelivery>[] = [
  {
    key: 'channel',
    label: 'Channel',
    filterOptions: CHANNEL_FILTER_OPTIONS,
    render: (_, row) => <ChannelBadge channels={[row.channel]} />,
  },
  {
    key: 'status',
    label: 'Status',
    filterOptions: DELIVERY_STATUS_OPTIONS,
    render: (_, row) => <StatusBadge status={row.status} />,
  },
  { key: 'attemptCount', label: 'Attempts' },
  {
    key: 'lastAttemptAt',
    label: 'Last attempt',
    render: (_, row) => formatDateTime(row.lastAttemptAt),
  },
  {
    key: 'errorMessage',
    label: 'Error',
    render: (_, row) => <ErrorText text={row.errorMessage} />,
  },
  {
    key: 'providerResponse',
    label: 'Provider response',
    render: (_, row) => (
      <>
        {row.providerResponseId && (
          <span className="admin-notification__provider-id">ID: {row.providerResponseId}</span>
        )}
        <ErrorText text={row.providerResponse} />
      </>
    ),
  },
]

/** Request facts as a definition list; a value of null shows as a dash. */
const Summary: FC<{ detail: Detail }> = ({ detail }) => {
  const items: Array<[string, ReactNode]> = [
    [
      'Status',
      <StatusBadge
        key="status"
        status={detail.status.code}
        statusLabel={detail.status.displayName}
      />,
    ],
    ['Tenant', detail.tenantName],
    ['Source', detail.requestRoute ?? '-'],
    ['Channels', <ChannelBadge key="channels" channels={detail.channels} />],
    ['Received', formatDateTime(detail.createdAt)],
    ['Scheduled for', formatDateTime(detail.scheduledFor)],
    ['Last updated', formatDateTime(detail.updatedAt)],
    ['Recipients', detail.recipientCount.toLocaleString()],
    ['Failed', detail.failedCount.toLocaleString()],
  ]
  return (
    <dl className="admin-notification__summary">
      {items.map(([term, value]) => (
        <div key={term} className="admin-notification__summary-item">
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

const StatusHistory: FC<{ detail: Detail }> = ({ detail }) => {
  if (detail.statusHistory.length === 0) return <p>No status changes recorded.</p>
  return (
    <ol className="admin-notification__history">
      {detail.statusHistory.map((change) => (
        <li key={`${change.status}-${change.at}`}>
          <StatusBadge status={change.status} />
          <time dateTime={change.at}>{formatDateTime(change.at)}</time>
        </li>
      ))}
    </ol>
  )
}

const DeliveryCounts: FC<{ detail: Detail }> = ({ detail }) => {
  if (detail.deliveryCounts.length === 0) return null
  return (
    <ul className="admin-notification__counts" aria-label="Deliveries by channel and status">
      {detail.deliveryCounts.map((c) => (
        <li key={`${c.channel}-${c.status}`}>
          {formatChannel(c.channel)} <StatusBadge status={c.status} />{' '}
          <strong>{c.count.toLocaleString()}</strong>
        </li>
      ))}
    </ul>
  )
}

const ErrorDetails: FC<{ detail: Detail }> = ({ detail }) => {
  if (!detail.errorReason && !detail.quarantine) return null
  return (
    <section className="page__section" aria-labelledby="admin-notification-error">
      <PageSubHeading title="Error" id="admin-notification-error" />
      <div className="page__section-body">
        {detail.errorReason && <ErrorText text={detail.errorReason} />}
        {detail.quarantine && (
          <p>
            Quarantined: {detail.quarantine.reason} ({detail.quarantine.viruses.join(', ')}),
            scanned {formatDateTime(detail.quarantine.scannedAt)}
          </p>
        )}
      </div>
    </section>
  )
}

const LogsLink: FC<{ href: string }> = ({ href }) => (
  <p>
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      iconRight={<OpenInNewIcon fontSize="inherit" aria-hidden="true" />}
    >
      View logs in Loki <span className="visually-hidden">(opens in a new tab)</span>
    </Link>
  </p>
)

interface AdminNotificationDetailProps {
  notificationRequestId: string
}

/**
 * One request for troubleshooting: its status history, errors, each delivery's attempts and a
 * link to its logs. Recipient addresses are never shown; the server redacts them from errors.
 * The route keys it by request id, so moving to another request starts it afresh.
 */
const AdminNotificationDetail: FC<AdminNotificationDetailProps> = ({ notificationRequestId }) => {
  const { detail, error: loadError } = useAdminNotification(notificationRequestId)
  const deliveries = useAdminDeliveries(notificationRequestId)

  return (
    <div className="page admin-notification">
      <PageHeading
        title={detail?.tenantName ?? 'Notification'}
        breadcrumbs={[{ label: 'Notifications', to: '/admin/notifications' }, { label: 'Request' }]}
        meta={`Request ID: ${notificationRequestId}`}
      />

      {loadError && <Alert variant="danger">{loadError}</Alert>}

      {detail && (
        <>
          <Summary detail={detail} />

          {detail.logsUrl && <LogsLink href={detail.logsUrl} />}

          <ErrorDetails detail={detail} />

          <section className="page__section" aria-labelledby="admin-notification-history">
            <PageSubHeading title="Status history" id="admin-notification-history" />
            <div className="page__section-body">
              <StatusHistory detail={detail} />
            </div>
          </section>
        </>
      )}

      <section className="page__section" aria-labelledby="admin-notification-deliveries">
        <PageSubHeading title="Deliveries" id="admin-notification-deliveries" />
        <div className="page__section-body">
          {detail && <DeliveryCounts detail={detail} />}
          <DataTable
            columns={deliveryColumns}
            data={deliveries.rows}
            keyExtractor={(row) => row.id}
            isLoading={deliveries.isLoading && deliveries.rows.length === 0}
            emptyMessage="No deliveries recorded"
            label="Deliveries"
            multiline
            currentPage={deliveries.page}
            pageSize={deliveries.limit}
            totalCount={deliveries.count}
            activeFilters={deliveries.filters}
            onFilter={deliveries.setFilter}
            onPageChange={deliveries.setPage}
            onPageSizeChange={deliveries.setLimit}
            pageSizeOptions={[15, 30, 50]}
          />
        </div>
      </section>
    </div>
  )
}

export default AdminNotificationDetail
