import { ExceptionFilter, Catch, ArgumentsHost, BadRequestException, Logger } from '@nestjs/common'
import { Response } from 'express'

interface ValidationError {
  [key: string]: string | string[]
}

interface FormattedValidationMessage {
  field: string
  message: string
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
      const formattedErrors = exceptionResponse.message
        .map((message: string) => this.formatValidationMessage(message))
        .filter(
          (item, index, items) =>
            items.findIndex(
              (candidate) => candidate.field === item.field && candidate.message === item.message,
            ) === index,
        )

      // Group errors by field
      for (const { field, message } of formattedErrors) {
        if (fieldErrors[field]) {
          if (Array.isArray(fieldErrors[field])) {
            ;(fieldErrors[field] as string[]).push(message)
          } else {
            fieldErrors[field] = [fieldErrors[field] as string, message]
          }
        } else {
          fieldErrors[field] = message
        }
      }

      this.logger.debug(`Validation errors by field: ${JSON.stringify(fieldErrors)}`)

      response.status(status).json({
        statusCode: status,
        message: 'Validation failed',
        errors: formattedErrors.map((item) => item.message),
        fieldErrors,
      })
    } else {
      // Default behavior for non-validation errors
      response.status(status).json(exceptionResponse)
    }
  }

  private formatValidationMessage(message: string): FormattedValidationMessage {
    const dataFieldMatch = message.match(/^(.*?attachments\.\d+)\.property data should not exist$/)
    if (dataFieldMatch) {
      return {
        field: `${dataFieldMatch[1]}.data`,
        message: "The attachment field 'data' is not supported. Use 'content' instead.",
      }
    }

    const attachmentFieldMatch = message.match(
      /^(.*?attachments\.\d+)\.Attachment (filename|MIME type|content) (.+)$/,
    )
    if (attachmentFieldMatch) {
      const [, prefix, fieldLabel, suffix] = attachmentFieldMatch
      const fieldKey =
        fieldLabel === 'filename' ? 'filename' : fieldLabel === 'MIME type' ? 'mimeType' : 'content'

      return {
        field: `${prefix}.${fieldKey}`,
        message: `Attachment ${fieldLabel} ${suffix}`,
      }
    }

    const match = message.match(/^([^\s]+)\s+(.+)$/)
    if (match) {
      return {
        field: match[1],
        message: match[2],
      }
    }

    return {
      field: 'general',
      message,
    }
  }
}
