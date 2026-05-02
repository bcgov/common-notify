import { NotificationChannel } from './notification-channel.enum'

describe('NotificationChannel Enum', () => {
  it('should have EMAIL channel with value "EMAIL"', () => {
    expect(NotificationChannel.EMAIL).toBe('EMAIL')
  })

  it('should have SMS channel with value "SMS"', () => {
    expect(NotificationChannel.SMS).toBe('SMS')
  })

  it('should have exactly 2 channels', () => {
    const channels = Object.values(NotificationChannel)
    expect(channels).toHaveLength(2)
    expect(channels).toContain('EMAIL')
    expect(channels).toContain('SMS')
  })
})
