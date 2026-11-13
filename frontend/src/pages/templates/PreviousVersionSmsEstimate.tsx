import type { FC } from 'react'
import { segmentSms } from '@/utils/smsSegments'

/** Length estimate for an SMS template's previous version; placeholders count as typed. */
const PreviousVersionSmsEstimate: FC<{ body: string }> = ({ body }) => {
  const { characters, segments } = segmentSms(body)
  return (
    <p className="previous-template-version__sms-estimate">
      Estimated characters: {characters}/1000 (excluding variable values)
      <br />
      Estimated SMS parts: {Math.max(1, segments)}
    </p>
  )
}

export default PreviousVersionSmsEstimate
