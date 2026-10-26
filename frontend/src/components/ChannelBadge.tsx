import { NotificationChannel } from '@/enum/notification-channel.enum'
import { TagGroup, TagList } from '@bcgov/design-system-react-components'

export function ChannelBadge({ channels }: { channels: string[] }) {
  const parseChannel = (channel: string) => {
    // compare the lowercase channel string against the lowercase NotificationChannel enum values
    // if there is a match, display the properly-cased enum value, otherwise display the original string.
    const match = Object.values(NotificationChannel).find(
      (value) => value.toLowerCase() === channel.toLowerCase(),
    )
    return match ?? channel
  }

  return (
    <TagGroup aria-label="Channels">
      <TagList
        items={channels.map((channel) => ({
          id: channel,
          textValue: parseChannel(channel),
          color: 'grey',
          tagStyle: 'circular',
          size: 'small',
        }))}
      />
    </TagGroup>
  )
}
