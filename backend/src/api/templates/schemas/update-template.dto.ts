import { IsString, IsEnum, IsOptional, MinLength, MaxLength } from 'class-validator'
import { TemplateEngine } from '../../../enum/template-engine.enum'
import { PartialType } from '@nestjs/mapped-types'
import { CreateTemplateDto } from './create-template.dto'

/**
 * DTO for updating an existing template
 * All fields are optional for PATCH operations
 */
export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {
  /**
   * Template name (must be unique within the tenant)
   * @example "Funding Approved Email v2"
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string

  /**
   * Optional description of the template
   * @example "Updated email sent to applicants when funding is approved"
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string

  /**
   * Email subject line (required for email templates)
   * @example "Your funding decision"
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  subject?: string

  /**
   * Template body with placeholders
   * @example "Dear {{firstName}}, your funding amount is ${{amount}}"
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string

  /**
   * Template rendering engine
   * Changing this creates a new version
   * @example "handlebars"
   */
  @IsOptional()
  @IsEnum(TemplateEngine)
  engineCode?: TemplateEngine
}
