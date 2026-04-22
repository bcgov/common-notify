import { Test, TestingModule } from '@nestjs/testing'
import { NotifyService } from './notify.service'

describe('NotifyService', () => {
  let service: NotifyService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotifyService],
    }).compile()

    service = module.get<NotifyService>(NotifyService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('notImplemented', () => {
    it('should return error response', () => {
      const result = service.notImplemented()

      expect(result).toBeDefined()
      expect(result.error).toBe('Not implemented')
      expect(result.message).toBe('This endpoint is not yet implemented')
      expect(result.timestamp).toBeDefined()
    })

    it('should return ISO timestamp', () => {
      const result = service.notImplemented()

      expect(result.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('should return consistent structure on multiple calls', () => {
      const result1 = service.notImplemented()
      const result2 = service.notImplemented()

      expect(result1.error).toBe(result2.error)
      expect(result1.message).toBe(result2.message)
    })
  })
})
