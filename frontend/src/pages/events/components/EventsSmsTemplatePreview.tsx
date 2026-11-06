import { TextArea } from '@bcgov/design-system-react-components'
import EventsSmsEstimate from './EventsSmsEstimate'

type EventsSmsTemplatePreviewProps = Readonly<{
  body: string
  isDisabled?: boolean
}>

export default function EventsSmsTemplatePreview({
  body,
  isDisabled,
}: EventsSmsTemplatePreviewProps) {
  return (
    <div className="events__template-preview events__template-preview--auto-size">
      <TextArea label="Template Preview" value={body} isReadOnly isDisabled={isDisabled} />
      <EventsSmsEstimate body={body} />
      <p className="events__help">
        Estimates change when template variables are replaced. Any tenant-name prefix added when
        sending is not included.
      </p>
    </div>
  )
}
