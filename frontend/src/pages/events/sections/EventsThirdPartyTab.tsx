import type { FC } from 'react'
import EventsChannelActiveSwitch from '../components/EventsChannelActiveSwitch'

// The third-party channel has nothing to configure yet, so the tab is just the activate
// switch, held off and disabled.
const EventsThirdPartyTab: FC = () => (
  <div className="events__form">
    <EventsChannelActiveSwitch isSelected={false} isDisabled />
  </div>
)

export default EventsThirdPartyTab
