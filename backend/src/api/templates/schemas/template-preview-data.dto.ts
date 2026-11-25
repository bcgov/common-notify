import { ApiProperty } from '@nestjs/swagger'
import { IsObject, Validate, ValidatorConstraint } from 'class-validator'
import type { ValidatorConstraintInterface } from 'class-validator'

@ValidatorConstraint({ name: 'previewParams', async: false })
export class PreviewParamsValidator implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.values(value).every((entry) => typeof entry === 'string')
    )
  }

  defaultMessage(): string {
    return 'params must be an object containing only string values'
  }
}

export class TemplatePreviewDataDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { firstName: 'Jane', isApproved: 'true' },
    description: 'Sample values keyed by placeholder name. Boolean values use "true" or "false".',
  })
  @IsObject()
  @Validate(PreviewParamsValidator)
  params: Record<string, string>
}
