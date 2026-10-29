import type { FC } from 'react'
import ChannelActiveSwitch from '../components/ChannelActiveSwitch'

// The third-party channel has nothing to configure yet, so the tab is just the activate
// switch, held off and disabled.
const EventsThirdPartyTab: FC = () => (
  <div className="events__form">
    <ChannelActiveSwitch isSelected={false} isDisabled />
  </div>
)

export default EventsThirdPartyTab
