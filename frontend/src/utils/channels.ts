/** Notification channel codes as the API sends them. */
export type ChannelCode = 'EMAIL' | 'SMS' | 'MSGAPP'

const CHANNEL_LABELS: Record<ChannelCode, string> = {
  EMAIL: 'Email',
  SMS: 'SMS',
  MSGAPP: 'Msgapp',
}

/** A channel code as a label: EMAIL -> Email, sms -> SMS. An unknown code is shown as given. */
export function formatChannel(channel: string): string {
  return CHANNEL_LABELS[channel.toUpperCase() as ChannelCode] ?? channel
}

/** DataTable filter options for the given channels, in the order given. */
export function channelFilterOptions(
  channels: readonly ChannelCode[] = ['EMAIL', 'SMS', 'MSGAPP'],
): Array<{ label: string; value: ChannelCode }> {
  return channels.map((value) => ({ label: CHANNEL_LABELS[value], value }))
}
