import type { Request, Response, NextFunction } from 'express'
import type { NestMiddleware } from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import { StructuredLoggerService } from '../common/logger'

@Injectable()
export class HTTPLoggerMiddleware implements NestMiddleware {
  constructor(private readonly logger: StructuredLoggerService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const { method, originalUrl } = request
    const startedAt = Date.now()

    response.on('finish', () => {
      const { statusCode } = response
      const contentLength = response.get('content-length') || '-'
      const userAgent = request.get('user-agent') || '-'
      const duration = Date.now() - startedAt

      this.logger.info(`${method} ${originalUrl} ${statusCode} ${contentLength} - ${userAgent}`, {
        context: 'HTTP',
        method,
        url: originalUrl,
        statusCode,
        contentLength,
        userAgent,
        duration,
      })
    })
    next()
  }
}
