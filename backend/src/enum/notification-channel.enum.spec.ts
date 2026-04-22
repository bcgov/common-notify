import { NotificationChannel } from './notification-channel.enum'

describe('NotificationChannel Enum', () => {
  it('should have EMAIL channel with value "email"', () => {
    expect(NotificationChannel.EMAIL).toBe('email')
  })

  it('should have SMS channel with value "sms"', () => {
    expect(NotificationChannel.SMS).toBe('sms')
  })

  it('should have exactly 2 channels', () => {
    const channels = Object.values(NotificationChannel)
    expect(channels).toHaveLength(2)
    expect(channels).toContain('email')
    expect(channels).toContain('sms')
  })
})
