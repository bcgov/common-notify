import type { FC } from 'react'
import { segmentSms, smsEncodingLabel } from '@/utils/smsSegments'

interface SmsSegmentEstimateProps {
  /** Raw template body as typed in the editor, placeholders and all. */
  body: string
}

/**
 * Live length estimate for an SMS template.
 *
 * Carriers bill each segment of a long SMS as its own message, so a template that runs past the
 * single-segment budget costs the tenant several messages per recipient. This is only ever an
 * estimate: placeholders are substituted at send time and the replacement values change both the
 * length and — if a value contains a non-GSM character — the encoding.
 */
const SmsSegmentEstimate: FC<SmsSegmentEstimateProps> = ({ body }) => {
  const { characters, segments, units, unitsPerSegment, remainingInLastSegment, encoding } =
    segmentSms(body)

  const messageCount = Math.max(1, segments)

  return (
    <div className="template-form__sms-estimate" aria-live="polite">
      <p className="template-form__sms-estimate-counts">
        <strong>{characters.toLocaleString()}</strong>{' '}
        {characters === 1 ? 'character' : 'characters'} &middot;{' '}
        <strong>
          {messageCount} {messageCount === 1 ? 'message' : 'messages'}
        </strong>{' '}
        &middot; {remainingInLastSegment.toLocaleString()} of {unitsPerSegment} remaining in this
        message &middot; {smsEncodingLabel(encoding)}
      </p>
      <p className="template-form__sms-estimate-note">
        {segments > 1
          ? `This template is ${units.toLocaleString()} characters of encoded length, so it is sent as ${segments} linked messages and billed as ${segments}. `
          : ''}
        {encoding === 'UCS_2'
          ? 'It contains characters outside the standard SMS alphabet (such as emoji or curly quotes), which reduces the limit to 70 characters per message. '
          : ''}
        Placeholders are replaced when the message is sent, so the final length — and the number of
        messages billed — may differ from this estimate.
      </p>
      <p className="template-form__sms-estimate-note">
        SMS is sent as plain text. Formatting such as <code>**bold**</code> or <code>#</code>{' '}
        headings is not rendered — those characters are sent as typed and count towards the length.
        Emoji are supported.
      </p>
    </div>
  )
}

export default SmsSegmentEstimate
