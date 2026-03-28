import { Test, TestingModule } from '@nestjs/testing'
import { EmailController } from './email.controller'
import { EmailService } from './email.service'

describe('EmailController', () => {
  let controller: EmailController
  let service: EmailService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailController],
      providers: [EmailService],
    }).compile()

    controller = module.get<EmailController>(EmailController)
    service = module.get<EmailService>(EmailService)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('send', () => {
    it('should send email and return response', async () => {
      const dto = {
        to: 'test@example.com',
        subject: 'Test',
        body: 'Test body',
      }

      const result = await controller.send(dto)

      expect(result.id).toBeDefined()
      expect(result.to).toBe('test@example.com')
      expect(result.status).toBe('sent')
    })
  })

  describe('getStatus', () => {
    it('should return email status', async () => {
      const result = await controller.getStatus('email_123')

      expect(result.id).toBe('email_123')
      expect(result.status).toBe('sent')
    })
  })
})
