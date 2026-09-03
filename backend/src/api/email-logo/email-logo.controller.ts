import { Controller, Get, Header, NotFoundException, Param, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
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
  @Header('X-Content-Type-Options', 'nosniff')
  async getImage(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const logo = await this.emailLogoService.findByIdIfApproved(id)

    if (!logo?.fileKey) {
      throw new NotFoundException('Email logo not found')
    }

    const metadata = await this.emailLogoStorage.head(logo.fileKey)
    if (!metadata) {
      throw new NotFoundException('Email logo not found')
    }

    const contentType = this.safeContentType(metadata.contentType, logo.fileKey)
    const eTag = this.normalizeETag(metadata.eTag)

    if (eTag) {
      response.setHeader('ETag', eTag)
    }
    if (metadata.lastModified) {
      response.setHeader('Last-Modified', metadata.lastModified.toUTCString())
    }

    if (this.isNotModified(request, eTag, metadata.lastModified)) {
      response.status(304).end()
      return
    }

    const content = await this.emailLogoStorage.download(logo.fileKey)
    response.setHeader('Content-Length', content.byteLength.toString())
    response.type(contentType).send(content)
  }

  private isNotModified(request: Request, eTag?: string, lastModified?: Date): boolean {
    const ifNoneMatch = request.headers['if-none-match']
    if (typeof ifNoneMatch === 'string') {
      return ifNoneMatch
        .split(',')
        .map((value) => value.trim())
        .some((value) => value === '*' || this.weakETag(value) === this.weakETag(eTag))
    }

    const ifModifiedSince = request.headers['if-modified-since']
    if (typeof ifModifiedSince !== 'string' || !lastModified) {
      return false
    }

    const since = Date.parse(ifModifiedSince)
    return (
      !Number.isNaN(since) && Math.floor(lastModified.getTime() / 1000) <= Math.floor(since / 1000)
    )
  }

  private normalizeETag(eTag?: string): string | undefined {
    if (!eTag) return undefined
    return eTag.startsWith('W/') || (eTag.startsWith('"') && eTag.endsWith('"'))
      ? eTag
      : `"${eTag}"`
  }

  private weakETag(eTag?: string): string | undefined {
    return eTag?.replace(/^W\//, '')
  }

  private safeContentType(contentType: string | undefined, fileKey: string): string {
    const normalized = contentType?.split(';', 1)[0].trim().toLowerCase()
    const allowed = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp'])

    return normalized && allowed.has(normalized) ? normalized : this.contentTypeFromFileKey(fileKey)
  }

  private contentTypeFromFileKey(fileKey: string): string {
    const contentTypes: Record<string, string> = {
      '.gif': 'image/gif',
      '.jpeg': 'image/jpeg',
      '.jpg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    }

    const contentType = contentTypes[path.extname(fileKey).toLowerCase()]
    if (!contentType) {
      throw new NotFoundException('Email logo not found')
    }
    return contentType
  }
}
