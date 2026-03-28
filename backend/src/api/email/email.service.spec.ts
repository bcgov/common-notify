import { Test, TestingModule } from '@nestjs/testing'
import { EmailService } from './email.service'

describe('EmailService', () => {
  let service: EmailService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailService],
    }).compile()

    service = module.get<EmailService>(EmailService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('sendEmail', () => {
    it('should send email and return response with id', async () => {
      const result = await service.sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test body',
      })

      expect(result.id).toBeDefined()
      expect(result.to).toBe('test@example.com')
      expect(result.subject).toBe('Test Subject')
      expect(result.status).toBe('sent')
      expect(result.timestamp).toBeInstanceOf(Date)
    })

    it('should include cc and bcc in mock', async () => {
      const result = await service.sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test body',
        cc: 'cc@example.com',
        bcc: 'bcc@example.com',
      })

      expect(result.status).toBe('sent')
      expect(result.id).toBeDefined()
    })
  })

  describe('getEmailStatus', () => {
    it('should return email status', async () => {
      const result = await service.getEmailStatus('email_123')

      expect(result.id).toBe('email_123')
      expect(result.status).toBe('sent')
      expect(result.timestamp).toBeInstanceOf(Date)
    })
  })
})
