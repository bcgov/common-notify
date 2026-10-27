import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { Button } from '@bcgov/design-system-react-components'
import DashboardOutlined from '@mui/icons-material/DashboardOutlined'
import '@/scss/components/no-data-card.scss'

interface NoDataCardProps {
  title: string
  message: string
  actionLabel: string
  /** Route of the page that creates the first item, e.g. '/template-create'. */
  actionTo: LinkProps['to']
  isActionDisabled?: boolean
}

/** Shown in place of a page's table when there is no data at all yet. */
const NoDataCard: FC<NoDataCardProps> = ({
  title,
  message,
  actionLabel,
  actionTo,
  isActionDisabled = false,
}) => {
  const navigate = useNavigate()

  return (
    <div className="no-data-card">
      <span className="no-data-card__icon" aria-hidden="true">
        <DashboardOutlined />
      </span>
      <p className="no-data-card__title">{title}</p>
      <p className="no-data-card__message">{message}</p>
      <Button
        variant="link"
        size="small"
        isDisabled={isActionDisabled}
        onPress={() => navigate({ to: actionTo })}
      >
        {actionLabel}
      </Button>
    </div>
  )
}

export default NoDataCard
