import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EmailLogo } from '../tenant-settings/entities/email-logo.entity'
import { EmailLogoRepository } from './email-logo.repository'
import { trimChar, trimCharEnd } from '../../common/utils/trim-char'

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

  async getDefault(): Promise<EmailLogo> {
    const logo = (await this.findApproved()).find((item) => item.isDefault)
    if (!logo) {
      throw new InternalServerErrorException('Default email logo is not configured')
    }
    return logo
  }

  buildPublicImageUrl(id: string): string {
    const configuredBaseUrl = this.configService.get<string>('emailLogo.publicBaseUrl')
    const baseUrl = configuredBaseUrl && trimCharEnd(configuredBaseUrl, '/')
    if (!baseUrl) {
      throw new InternalServerErrorException('Public API gateway base URL is not configured')
    }

    const configuredPrefix = this.configService.get<string>('emailLogo.publicPathPrefix') || ''
    const pathPrefix = configuredPrefix ? `/${trimChar(configuredPrefix, '/')}` : ''

    return `${baseUrl}${pathPrefix}/logos/${encodeURIComponent(id)}/image`
  }

  /** The image URL for use inside an email, which serves the PNG rendition rather than the SVG. */
  buildEmailImageUrl(id: string): string {
    return `${this.buildPublicImageUrl(id)}?format=email`
  }
}
