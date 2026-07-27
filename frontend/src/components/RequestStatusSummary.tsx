import type { FC } from 'react'
import { Separator } from '@bcgov/design-system-react-components'
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer'
import GroupIcon from '@mui/icons-material/Group'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import { NotificationChannel } from '@/enum/notification-channel.enum'
import '@/scss/components/request-status.scss'
import { NotificationStatusCode } from '@/interfaces/NotificationRequest'
import { StatusBadge } from '@/components/StatusBadge'

interface RequestStatusSummaryProps {
  channels: string[]
  recipientsCount: number
  sentDate: Date
  overallStatus: NotificationStatusCode | null
}

const formatChannels = (channels: string[]): string =>
  channels
    .map((channel) => {
      const match = Object.values(NotificationChannel).find(
        (value) => value.toLowerCase() === channel.toLowerCase(),
      )
      return match ?? channel
    })
    .join(', ')

const formatSentDate = (date: Date): string =>
  date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

/**
 * RequestStatusSummary Component
 * Displays a summary card on the Request Status page
 */
const RequestStatusSummary: FC<RequestStatusSummaryProps> = ({
  channels,
  recipientsCount,
  sentDate,
  overallStatus,
}) => {
  return (
    <div className="request-summary">
      <div className="request-summary__section">
        <span className="request-summary__label">
          <QuestionAnswerIcon fontSize="small" />
          Channels
        </span>
        <span className="request-summary__value">{formatChannels(channels)}</span>
      </div>

      <Separator orientation="vertical" size="small" />

      <div className="request-summary__section">
        <span className="request-summary__label">
          <GroupIcon fontSize="small" />
          Recipients
        </span>
        <span className="request-summary__value">{recipientsCount}</span>
      </div>

      <Separator orientation="vertical" size="small" />

      <div className="request-summary__section">
        <span className="request-summary__label">
          <CalendarTodayIcon fontSize="small" />
          Sent
        </span>
        <span className="request-summary__value">{formatSentDate(sentDate)}</span>
      </div>

      <Separator orientation="vertical" size="small" />

      <div className="request-summary__section">
        <span className="request-summary__label request-summary__label--no-gutter">
          Overall Status
        </span>
        <span className="request-summary__value request-summary__value--status">
          <StatusBadge
            status={overallStatus?.code}
            statusLabel={overallStatus?.displayName}
          />
        </span>
      </div>
    </div>
  )
}

export default RequestStatusSummary
