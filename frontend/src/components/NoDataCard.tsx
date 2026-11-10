import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { Button } from '@bcgov/design-system-react-components'
import DashboardOutlined from '@mui/icons-material/DashboardOutlined'
import '@/scss/components/no-data-card.scss'

interface NoDataCardAction {
  actionLabel: string
  /** Route of the page that creates the first item, e.g. '/template-create'. */
  actionTo: LinkProps['to']
  isActionDisabled?: boolean
}

/** The action is optional, but a label without a route (or the reverse) is not allowed. */
type NoDataCardProps = {
  title: string
  message: string
} & (NoDataCardAction | { actionLabel?: never; actionTo?: never; isActionDisabled?: never })

// Its own component so useNavigate only runs when there is somewhere to go: a card without an
// action can render outside a router, e.g. in a modal.
const NoDataCardActionButton: FC<NoDataCardAction> = ({
  actionLabel,
  actionTo,
  isActionDisabled = false,
}) => {
  const navigate = useNavigate()

  return (
    <Button
      variant="link"
      size="small"
      isDisabled={isActionDisabled}
      onPress={() => navigate({ to: actionTo })}
    >
      {actionLabel}
    </Button>
  )
}

/** Shown in place of a table when there is no data at all yet. */
const NoDataCard: FC<NoDataCardProps> = ({
  title,
  message,
  actionLabel,
  actionTo,
  isActionDisabled,
}) => (
  <div className="no-data-card">
    <span className="no-data-card__icon" aria-hidden="true">
      <DashboardOutlined />
    </span>
    <p className="no-data-card__title">{title}</p>
    <p className="no-data-card__message">{message}</p>
    {actionLabel && actionTo && (
      <NoDataCardActionButton
        actionLabel={actionLabel}
        actionTo={actionTo}
        isActionDisabled={isActionDisabled}
      />
    )}
  </div>
)

export default NoDataCard
