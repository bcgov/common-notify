import { TextArea } from '@bcgov/design-system-react-components'
import { segmentSms } from '@/utils/smsSegments'
import '@/scss/components/sms-preview.scss'

interface Props {
  body: string
  label?: string
  showParts?: boolean
}

/** Read-only SMS preview; the displayed maximum comes from the bulk SMS design. */
export default function SmsPreview({ body, label, showParts = false }: Props) {
  const { characters, segments } = segmentSms(body)
  return (
    <div className={`sms-preview${showParts ? ' sms-preview--final' : ''}`}>
      <TextArea
        label={label}
        aria-label={label ?? 'SMS message preview'}
        value={body}
        isReadOnly
        rows={showParts ? 14 : 10}
        description={`${characters}/612 characters maximum`}
      />
      {showParts && (
        <p className="bulk-notifications__hint">Estimated parts: {Math.max(1, segments)}</p>
      )}
    </div>
  )
}
