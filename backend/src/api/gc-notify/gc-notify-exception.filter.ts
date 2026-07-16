import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common'
import { Response } from 'express'

interface GcNotifyErrorItem {
  error: string
  message: string
}

/**
 * Reshapes thrown exceptions into the exact error shapes the real GC Notify v2 API
 * uses, so GC Notify clients see a familiar response regardless of whether the
 * request was served via passthrough or internal execution.
 *
 * - 404 / 500: `{ result: 'error', message }` (GC Notify's `Error` schema)
 * - everything else (400 / 401 / 403 / 429): `{ status_code, errors: [{ error, message }] }`
 *   (GC Notify's `ValidationErrorResponse` schema)
 *
 * Applied at the controller level (`@UseFilters`) so it takes precedence over the
 * app-wide `ValidationExceptionFilter`, which targets the native Notify API's shape.
 */
@Catch(HttpException)
export class GcNotifyExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const status = exception.getStatus()
    const body = exception.getResponse()

    const errors = this.toGcNotifyErrors(status, body, exception.message)

    if (status === HttpStatus.NOT_FOUND || status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      response.status(status).json({
        result: 'error',
        message: errors[0]?.message ?? exception.message,
      })
      return
    }

    response.status(status).json({
      status_code: status,
      errors,
    })
  }

  private toGcNotifyErrors(
    status: number,
    body: unknown,
    fallbackMessage: string,
  ): GcNotifyErrorItem[] {
    // Exceptions thrown with an already GC Notify-shaped body (e.g.
    // `new BadRequestException({ errors: [{ error: 'ValidationError', message: '...' }] })`)
    // pass through unchanged.
    if (body && typeof body === 'object' && Array.isArray((body as { errors?: unknown }).errors)) {
      return (body as { errors: GcNotifyErrorItem[] }).errors
    }

    const errorName = this.defaultErrorName(status)
    const messages = this.extractMessages(body, fallbackMessage)
    return messages.map((message) => ({ error: errorName, message }))
  }

  private extractMessages(body: unknown, fallbackMessage: string): string[] {
    if (body && typeof body === 'object' && 'message' in body) {
      const message = (body as { message: unknown }).message
      if (Array.isArray(message)) return message.map(String)
      if (typeof message === 'string') return [message]
    }
    return [fallbackMessage]
  }

  private defaultErrorName(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
      case HttpStatus.FORBIDDEN:
        return 'AuthError'
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RateLimitError'
      default:
        return 'ValidationError'
    }
  }
}
