import type { FC } from 'react'
import { Switch } from '@bcgov/design-system-react-components'

// The third-party channel has nothing to configure yet, so the tab is just the activate
// switch, held off and disabled.
const EventsThirdPartyTab: FC = () => (
  <div className="events__form">
    <div className="events__switch-field">
      <span className="events__field-label">Activate channel</span>
      <Switch labelPosition="right" aria-label="Activate channel" isSelected={false} isDisabled>
        Off
      </Switch>
    </div>
  </div>
)

export default EventsThirdPartyTab
