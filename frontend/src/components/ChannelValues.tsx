import type { ReactNode } from 'react'
import { formatChannel } from '@/utils/usage'
import '@/scss/components/channel-values.scss'

interface ChannelValuesProps<T extends { channel: string }> {
  rows: readonly T[]
  render: (row: T) => ReactNode
  /** Prefix each value with its channel for screen readers. Off for a column of channel names. */
  labelled?: boolean
}

/**
 * One value per channel, stacked on fixed-height lines so the same channel lines up across a
 * row's cells: a tenant's Email and SMS figures in one table row instead of two.
 */
function ChannelValues<T extends { channel: string }>({
  rows,
  render,
  labelled = true,
}: Readonly<ChannelValuesProps<T>>) {
  return (
    <ul className="channel-values">
      {rows.map((row) => (
        <li key={row.channel} className="channel-values__item">
          {labelled && <span className="visually-hidden">{formatChannel(row.channel)}: </span>}
          {render(row)}
        </li>
      ))}
    </ul>
  )
}

export default ChannelValues
