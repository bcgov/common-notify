import type { FC } from 'react'
import type { HealthStatus } from '@/interfaces/queueMonitoring.interface'
import '@/scss/components/meter-bar.scss'

interface MeterBarProps {
  label: string
  /** 0–100. */
  percent: number
  /** What a screen reader announces instead of the bare percentage. */
  valueText: string
  status?: HealthStatus
  /** 0–100. Draws a tick at a reference point such as a past peak; describe it in valueText. */
  markerPercent?: number
}

const clamp = (value: number) => Math.min(100, Math.max(0, value))

/** A horizontal fill gauge for a value against a ceiling, coloured by health. */
const MeterBar: FC<MeterBarProps> = ({
  label,
  percent,
  valueText,
  status = 'healthy',
  markerPercent,
}) => {
  const clamped = clamp(percent)
  return (
    <div
      className="meter-bar"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-valuetext={valueText}
    >
      <div
        className={`meter-bar__fill meter-bar__fill--${status}`}
        style={{ width: `${clamped}%` }}
      />
      {markerPercent !== undefined && (
        <div className="meter-bar__marker" style={{ left: `${clamp(markerPercent)}%` }} />
      )}
    </div>
  )
}

export default MeterBar
