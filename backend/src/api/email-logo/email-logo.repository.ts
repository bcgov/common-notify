import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { EmailLogo } from '../tenant-settings/entities/email-logo.entity'

@Injectable()
export class EmailLogoRepository {
  constructor(
    @InjectRepository(EmailLogo)
    private readonly repo: Repository<EmailLogo>,
  ) {}

  findApproved(): Promise<EmailLogo[]> {
    return this.repo.find({
      where: {
        statusCode: 'APPROVED',
        isDeleted: false,
      },
    })
  }

  findByIdIfApproved(id: string): Promise<EmailLogo | null> {
    return this.repo.findOne({
      where: {
        id,
        statusCode: 'APPROVED',
        isDeleted: false,
      },
    })
  }
}
