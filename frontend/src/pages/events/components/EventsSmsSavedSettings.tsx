import { Button, Callout } from '@bcgov/design-system-react-components'
import StickyBar from '@/components/StickyBar'
import EventsSmsEstimate from './EventsSmsEstimate'

type EventsSmsSavedSettingsProps = Readonly<{
  channelActive: boolean
  selectedTemplate?: { body: string }
  onEdit: () => void
}>

export default function EventsSmsSavedSettings({
  channelActive,
  selectedTemplate,
  onEdit,
}: EventsSmsSavedSettingsProps) {
  return (
    <>
      <Callout
        variant="lightGrey"
        title={channelActive ? 'Ready to send?' : 'SMS settings saved'}
        description={
          channelActive
            ? 'Your SMS settings are ready. Continue to select recipients and send a test notification to verify the content and formatting.'
            : 'Your SMS settings are saved. Activate this channel when you are ready to send notifications.'
        }
      />
      {selectedTemplate ? (
        <div className="events__saved-preview">
          <p className="events__template-preview-content">{selectedTemplate.body}</p>
          <EventsSmsEstimate body={selectedTemplate.body} />
        </div>
      ) : (
        <p className="events__help">
          The saved template preview is unavailable. Open settings to select a template.
        </p>
      )}
      <p className="events__help">Test notifications are not available yet.</p>
      <StickyBar>
        <Button type="button" variant="secondary" onPress={onEdit}>
          Edit settings
        </Button>
        <Button type="button" variant="primary" isDisabled>
          Continue to test notification
        </Button>
      </StickyBar>
    </>
  )
}
