import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator'

/**
 * The character set a CSTAR group ID may use, matching CstarApiClient.SAFE_PATH_SEGMENT and the
 * chk_event_channel_cstar_group_id constraint: an ID accepted here is one the client can safely
 * place in a CSTAR URL path when it resolves the group's members.
 */
const CSTAR_GROUP_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

/**
 * DTO for updating an event's EMAIL channel settings (Email Notification tab)
 *
 * The tab owns every field it submits, so this replaces the stored settings rather than patching
 * individual ones. `senderEmail` and `templateId` are required, explicitly nullable so an
 * inactive channel can be saved half-filled. `to`/`cc`/`bcc` are optional lists of recipient
 * addresses, normalized and stored as rows in notify.event_channel_recipient.
 *
 * `cstarGroupIdsTo`/`Cc`/`Bcc` address the same three lists to CSTAR groups instead of, or as
 * well as, typed-in addresses. A list may carry any number of groups; only the IDs are stored,
 * in notify.event_channel_cstar_group, and their members are resolved from CSTAR at send time.
 *
 * `active` is included here because this is the only path that switches the channel on - the
 * tab's toggle is local until the settings are applied. When it is true the submitted fields
 * must be complete (sender email, template, and at least one "to" recipient - an address or a
 * group), matching chk_event_channel_setting_active_complete and the recipient half that
 * EventsService enforces alongside it.
 */
export class UpdateEmailChannelSettingDto {
  /**
   * Whether the event should send on the email channel once these settings are saved.
   * @example true
   */
  @IsBoolean()
  active: boolean

  /**
   * From address for email sends, overrides default sender address from settings.
   * @example "no-reply@gov.bc.ca"
   */
  @ValidateIf((dto: UpdateEmailChannelSettingDto) => dto.senderEmail !== null)
  @IsEmail()
  @MaxLength(320)
  senderEmail: string | null

  /**
   * Template used to render this channel. Required before the channel can be activated,
   * matching chk_event_channel_setting_active_complete.
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  @ValidateIf((dto: UpdateEmailChannelSettingDto) => dto.templateId !== null)
  @IsUUID()
  templateId: string | null

  /**
   * Primary recipients for this channel.
   * @example ["alice@example.com"]
   */
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  @MaxLength(320, { each: true })
  to?: string[]

  /**
   * CC recipients for this channel.
   * @example ["bob@example.com"]
   */
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  @MaxLength(320, { each: true })
  cc?: string[]

  /**
   * BCC recipients for this channel.
   * @example ["carol@example.com"]
   */
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  @MaxLength(320, { each: true })
  bcc?: string[]

  /**
   * CSTAR groups addressed in the To field. Any number of groups; their members are resolved
   * from CSTAR at send time.
   * @example ["3fa85f64-5717-4562-b3fc-2c963f66afa6"]
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(CSTAR_GROUP_ID_PATTERN, { each: true })
  cstarGroupIdsTo?: string[]

  /**
   * CSTAR groups addressed in the CC field.
   * @example ["3fa85f64-5717-4562-b3fc-2c963f66afa6"]
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(CSTAR_GROUP_ID_PATTERN, { each: true })
  cstarGroupIdsCc?: string[]

  /**
   * CSTAR groups addressed in the BCC field.
   * @example ["3fa85f64-5717-4562-b3fc-2c963f66afa6"]
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(CSTAR_GROUP_ID_PATTERN, { each: true })
  cstarGroupIdsBcc?: string[]

  /**
   * Whether the email uses a custom header rather than the tenant's default one. Omitted means
   * the tenant default, which is also what clears any stored header values.
   * @example true
   */
  @IsOptional()
  @IsBoolean()
  useCustomHeader?: boolean

  /**
   * Approved email logo shown in the custom header. Null for a custom header with no logo.
   * Ignored unless useCustomHeader is true.
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  @IsOptional()
  @IsUUID()
  headerLogoId?: string | null

  /**
   * Title text shown beside the logo in the custom header. Ignored unless useCustomHeader is true.
   * @example "Ministry of Education"
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  headerTitle?: string | null
}
