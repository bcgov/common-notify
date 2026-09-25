// PartialType from @nestjs/swagger, not @nestjs/mapped-types: both make every field optional,
// but only this one carries the @ApiProperty metadata across, which is what keeps this DTO
// from publishing as an empty schema.
import { PartialType } from '@nestjs/swagger'
import { CreateTemplateDto } from './create-template.dto'

/**
 * DTO for updating an existing template
 * All fields are optional for PATCH operations
 */
export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {}
