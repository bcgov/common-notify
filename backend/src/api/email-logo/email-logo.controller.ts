import { Controller, Get, Header, NotFoundException, Param, Res } from '@nestjs/common'
import type { Response } from 'express'
import * as path from 'path'
import { Public } from '../../common/decorators/public.decorator'
import { EmailLogoService } from './email-logo.service'
import { EmailLogoStorageService } from './email-logo-storage.service'

@Controller('logos')
export class EmailLogoController {
  constructor(
    private readonly emailLogoService: EmailLogoService,
    private readonly emailLogoStorage: EmailLogoStorageService,
  ) {}

  @Get(':id/image')
  @Public()
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  async getImage(@Param('id') id: string, @Res() response: Response): Promise<void> {
    const logo = await this.emailLogoService.findByIdIfApproved(id)

    if (!logo?.fileKey) {
      throw new NotFoundException('Email logo not found')
    }

    const metadata = await this.emailLogoStorage.head(logo.fileKey)
    const content = await this.emailLogoStorage.download(logo.fileKey)
    const contentType = metadata?.contentType || this.contentTypeFromFileKey(logo.fileKey)

    response.type(contentType).send(content)
  }

  private contentTypeFromFileKey(fileKey: string): string {
    const contentTypes: Record<string, string> = {
      '.gif': 'image/gif',
      '.jpeg': 'image/jpeg',
      '.jpg': 'image/jpeg',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
    }

    return contentTypes[path.extname(fileKey).toLowerCase()] || 'application/octet-stream'
  }
}
