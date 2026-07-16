import type { FC } from 'react'

interface NumberInputFieldProps {
  id: string
  label: string
  value: number
  min?: number
  max?: number
  disabled?: boolean
  onChange: (value: number) => void
}

/**
 * A labeled numeric input (Bootstrap form-control). Emits the parsed number via onChange.
 */
const NumberInputField: FC<NumberInputFieldProps> = ({
  id,
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}) => (
  <div>
    <label className="form-label" htmlFor={id}>
      {label}
    </label>
    <input
      id={id}
      type="number"
      min={min}
      max={max}
      className="form-control"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  </div>
)

export default NumberInputField
