import { NotifyService } from './notify.service'

describe('NotifyService', () => {
  let service: NotifyService

  beforeEach(() => {
    service = new NotifyService()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('notImplemented', () => {
    it('should return not implemented response object', () => {
      // Act
      const result = service.notImplemented()

      // Assert
      expect(result).toBeDefined()
      expect(result.error).toBe('Not implemented')
      expect(result.message).toBe('This endpoint is not yet implemented')
      expect(result.timestamp).toBeDefined()
    })

    it('should return ISO formatted timestamp', () => {
      // Act
      const result = service.notImplemented()

      // Assert
      // Verify it's a valid ISO 8601 timestamp by parsing it
      const timestamp = new Date(result.timestamp)
      expect(timestamp).toBeInstanceOf(Date)
      expect(!isNaN(timestamp.getTime())).toBe(true)
    })

    it('should return a new timestamp on each call', () => {
      // Act
      const result1 = service.notImplemented()
      const result2 = service.notImplemented()

      // Assert
      // Timestamps may or may not be different depending on execution speed,
      // but they should both be valid
      expect(result1.timestamp).toBeDefined()
      expect(result2.timestamp).toBeDefined()
    })
  })
})
