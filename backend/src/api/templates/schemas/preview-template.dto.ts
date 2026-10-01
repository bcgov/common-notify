import { IsObject, IsOptional } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

/**
 * DTO for previewing a template with sample data
 * Renders the template without storing anything
 */
export class PreviewTemplateDto {
  /**
   * Object containing parameter values for template rendering
   * Keys correspond to placeholders in the template
   *
   * @example {
   *   "firstName": "John",
   *   "lastName": "Doe",
   *   "amount": "5000",
   *   "premium": "yes"
   * }
   */
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Values for the template placeholders, keyed by placeholder name. Every placeholder the ' +
      'template uses must be supplied.',
    example: { firstName: 'John', lastName: 'Doe', amount: '5000' },
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>
}
