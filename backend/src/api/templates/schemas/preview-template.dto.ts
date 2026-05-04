import { IsObject, IsOptional } from 'class-validator'

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
  @IsOptional()
  @IsObject()
  personalisation?: Record<string, any>
}
