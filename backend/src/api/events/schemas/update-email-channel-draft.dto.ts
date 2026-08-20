import { IsArray, IsEmail, IsOptional, IsUUID, MaxLength, ValidateIf } from 'class-validator'

/**
 * DTO for saving an event's EMAIL channel settings as a draft ("Save draft").
 *
 * Every field is optional and nullable so a partially filled-in tab can be saved. The service
 * always forces `active` to false for a draft, so `active` is not accepted here.
 */
export class UpdateEmailChannelDraftDto {
  /**
   * From address for email sends. Omit or set null to leave unset.
   * @example "no-reply@gov.bc.ca"
   */
  @IsOptional()
  @ValidateIf((dto: UpdateEmailChannelDraftDto) => dto.senderEmail !== null)
  @IsEmail()
  @MaxLength(320)
  senderEmail?: string | null

  /**
   * Template used to render this channel. Omit or set null to leave unset.
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  @IsOptional()
  @ValidateIf((dto: UpdateEmailChannelDraftDto) => dto.templateId !== null)
  @IsUUID()
  templateId?: string | null

  /**
   * Primary recipients for this channel.
   * @example ["alice@example.com"]
   */
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  to?: string[]

  /**
   * CC recipients for this channel.
   * @example ["bob@example.com"]
   */
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[]

  /**
   * BCC recipients for this channel.
   * @example ["carol@example.com"]
   */
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  bcc?: string[]
}
