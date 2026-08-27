import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EmailLogo } from '../tenant-settings/entities/email-logo.entity'
import { EmailLogoRepository } from './email-logo.repository'

@Injectable()
export class EmailLogoService {
  constructor(
    private readonly emailLogoRepository: EmailLogoRepository,
    private readonly configService: ConfigService,
  ) {}

  findApproved(): Promise<EmailLogo[]> {
    return this.emailLogoRepository.findApproved()
  }

  findByIdIfApproved(id: string): Promise<EmailLogo | null> {
    return this.emailLogoRepository.findByIdIfApproved(id)
  }

  buildPublicImageUrl(id: string): string {
    const baseUrl = this.configService.get<string>('emailLogo.publicBaseUrl')?.replace(/\/+$/, '')
    if (!baseUrl) {
      throw new InternalServerErrorException('Public API gateway base URL is not configured')
    }

    const configuredPrefix = this.configService.get<string>('emailLogo.publicPathPrefix') || ''
    const pathPrefix = configuredPrefix ? `/${configuredPrefix.replace(/^\/+|\/+$/g, '')}` : ''

    return `${baseUrl}${pathPrefix}/logos/${encodeURIComponent(id)}/image`
  }
}
