import { formatChannel } from '@/utils/channels'
import { TagGroup, TagList } from '@bcgov/design-system-react-components'

export function ChannelBadge({ channels }: Readonly<{ channels: string[] }>) {
  return (
    <TagGroup aria-label="Channels">
      <TagList
        items={channels.map((channel) => ({
          id: channel,
          textValue: formatChannel(channel),
          color: 'grey',
          tagStyle: 'circular',
          size: 'small',
        }))}
      />
    </TagGroup>
  )
}
