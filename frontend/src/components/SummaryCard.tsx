import type { FC, ReactNode } from 'react'
import '@/scss/components/summary-card.scss'

interface SummaryCardProps {
  title: string
  /** The headline figure. */
  value: ReactNode
  /** Supporting lines under the figure. */
  children?: ReactNode
}

/** A headline figure with context, for the top of a dashboard. Lay out in `.summary-card-grid`. */
const SummaryCard: FC<SummaryCardProps> = ({ title, value, children }) => (
  <section className="summary-card" aria-label={title}>
    <h3 className="summary-card__title">{title}</h3>
    <p className="summary-card__value">{value}</p>
    {children && <div className="summary-card__body">{children}</div>}
  </section>
)

export default SummaryCard
