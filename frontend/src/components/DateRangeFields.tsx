import type { FC } from 'react'
import { DatePicker } from '@bcgov/design-system-react-components'
import { parseDate } from '@internationalized/date'
import type { CalendarDate } from '@internationalized/date'
import '@/scss/components/date-range-fields.scss'

export interface DateRange {
  /** YYYY-MM-DD, or null for an open start. */
  from: string | null
  /** YYYY-MM-DD, or null for an open end. */
  to: string | null
}

interface DateRangeFieldsProps extends DateRange {
  onChange: (range: DateRange) => void
  fromLabel?: string
  toLabel?: string
}

function toCalendarDate(day: string | null): CalendarDate | null {
  if (!day) return null
  try {
    return parseDate(day)
  } catch {
    return null
  }
}

/**
 * A start and end date, each a design-system DatePicker. Each picker stops the other crossing
 * it, so the range can't run backwards. Medium size, the height of the search field beside it.
 */
const DateRangeFields: FC<DateRangeFieldsProps> = ({
  from,
  to,
  onChange,
  fromLabel = 'From',
  toLabel = 'To',
}) => {
  const fromDate = toCalendarDate(from)
  const toDate = toCalendarDate(to)

  return (
    <div className="date-range-fields">
      <DatePicker
        label={fromLabel}
        showFormatHelpText={false}
        value={fromDate}
        maxValue={toDate ?? undefined}
        onChange={(value) => onChange({ from: value?.toString() ?? null, to })}
      />
      <DatePicker
        label={toLabel}
        showFormatHelpText={false}
        value={toDate}
        minValue={fromDate ?? undefined}
        onChange={(value) => onChange({ from, to: value?.toString() ?? null })}
      />
    </div>
  )
}

export default DateRangeFields
