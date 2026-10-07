import type { FC, ReactNode } from 'react'
import '@/scss/components/stat-tile.scss'

interface StatTileProps {
  label: string
  value: ReactNode
  /** Secondary line under the value, e.g. a limit or a comparison. */
  hint?: ReactNode
}

/** A single labelled figure. Use inside a `.stat-tile-grid` to lay several out in a row. */
const StatTile: FC<StatTileProps> = ({ label, value, hint }) => (
  <div className="stat-tile">
    <dt className="stat-tile__label">{label}</dt>
    <dd className="stat-tile__value">{value}</dd>
    {hint != null && <dd className="stat-tile__hint">{hint}</dd>}
  </div>
)

export default StatTile
