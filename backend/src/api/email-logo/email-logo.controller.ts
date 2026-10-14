import { Controller, Get, Header, NotFoundException, Param, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import * as path from 'path'
import { Public } from '../../common/decorators/public.decorator'
import { EmailLogoService } from './email-logo.service'
import { EmailLogoStorageService } from './email-logo-storage.service'
import { ApiExcludeController } from '@nestjs/swagger'

// Not part of the service API; kept out of the published spec.
@ApiExcludeController()
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
  async getImage(
    @Param('id') id: string,
    @Res() response: Response,
    @Query('format') format?: string,
  ): Promise<void> {
    const logo = await this.emailLogoService.findByIdIfApproved(id)

    // Emails ask for format=email and get the PNG rendition, which mail clients render; the
    // frontend omits it and gets the SVG.
    const fileKey = format === 'email' ? (logo?.emailFileKey ?? logo?.fileKey) : logo?.fileKey

    if (!fileKey) {
      throw new NotFoundException('Email logo not found')
    }

    const metadata = await this.emailLogoStorage.head(fileKey)
    const content = await this.emailLogoStorage.download(fileKey)
    const contentType = metadata?.contentType || this.contentTypeFromFileKey(fileKey)

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
