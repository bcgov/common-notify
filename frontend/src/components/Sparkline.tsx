import type { FC } from 'react'
import '@/scss/components/sparkline.scss'

interface SparklineSeries {
  values: number[]
  /** BEM modifier for the stroke colour, e.g. 'in' or 'out'. */
  variant: string
}

interface SparklineProps {
  series: SparklineSeries[]
  /** Text alternative; the chart itself is decorative to assistive tech. */
  label: string
  width?: number
  height?: number
}

/**
 * A tiny trend line for one or more series sharing a y-axis. It is a glance aid only: the
 * figures it summarises must also be shown as text beside it.
 */
const Sparkline: FC<SparklineProps> = ({ series, label, width = 120, height = 28 }) => {
  const max = Math.max(1, ...series.flatMap((s) => s.values))
  const points = (values: number[]) =>
    values
      .map((value, i) => {
        const x = values.length > 1 ? (i / (values.length - 1)) * width : 0
        const y = height - 1 - (value / max) * (height - 2)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')

  return (
    <svg
      className="sparkline"
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
    >
      {series.map((s) => (
        <polyline
          key={s.variant}
          className={`sparkline__line sparkline__line--${s.variant}`}
          points={points(s.values)}
        />
      ))}
    </svg>
  )
}

export default Sparkline
