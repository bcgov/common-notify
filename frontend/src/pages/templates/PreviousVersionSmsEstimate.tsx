import type { FC } from 'react'
import { segmentSms } from '@/utils/smsSegments'

/** Length estimate for an SMS template's previous version; placeholders count as typed. */
const PreviousVersionSmsEstimate: FC<{ body: string }> = ({ body }) => {
  const { characters, segments } = segmentSms(body)
  return (
    <p className="previous-template-version__sms-estimate">
      Estimated character count: {characters}/1000 characters maximum - this is excluding the values
      of the variables
      <br />
      Estimated parts: {Math.max(1, segments)}
    </p>
  )
}

export default PreviousVersionSmsEstimate
