import { Injectable } from '@nestjs/common'
import { EmailLogo } from '../tenant-settings/entities/email-logo.entity'
import { EmailLogoRepository } from './email-logo.repository'

@Injectable()
export class EmailLogoService {
  constructor(private readonly emailLogoRepository: EmailLogoRepository) {}

  findApproved(): Promise<EmailLogo[]> {
    return this.emailLogoRepository.findApproved()
  }

  findByIdIfApproved(id: string): Promise<EmailLogo | null> {
    return this.emailLogoRepository.findByIdIfApproved(id)
  }
}
