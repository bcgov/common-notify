import { ExceptionFilter, Catch, ArgumentsHost, BadRequestException, Logger } from '@nestjs/common'
import { Response } from 'express'

interface ValidationError {
  [key: string]: string | string[]
}

/**
 * Custom exception filter for better validation error formatting
 * Converts validation error arrays into more readable field-by-field format
 */
@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ValidationExceptionFilter.name)

  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const status = exception.getStatus()
    const exceptionResponse = exception.getResponse() as any

    // If it's a validation error, reformat it
    if (status === 400 && exceptionResponse.message && Array.isArray(exceptionResponse.message)) {
      const fieldErrors: ValidationError = {}

      // Group errors by field
      for (const message of exceptionResponse.message) {
        // Extract field name from validation message
        // Messages are typically like "field_name error description"
        const match = message.match(/^(\w+)\s+(.+)$/)
        if (match) {
          const field = match[1]
          const error = match[2]
          if (fieldErrors[field]) {
            if (Array.isArray(fieldErrors[field])) {
              ;(fieldErrors[field] as string[]).push(error)
            } else {
              fieldErrors[field] = [fieldErrors[field] as string, error]
            }
          } else {
            fieldErrors[field] = error
          }
        }
      }

      this.logger.debug(`Validation errors by field: ${JSON.stringify(fieldErrors)}`)

      response.status(status).json({
        statusCode: status,
        message: 'Validation failed',
        errors: exceptionResponse.message,
        fieldErrors,
      })
    } else {
      // Default behavior for non-validation errors
      response.status(status).json(exceptionResponse)
    }
  }
}
