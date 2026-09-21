/**
 * An event that renders one of its live channels with the template
 */
export class TemplateUsageEventDto {
  /**
   * Event ID (UUID)
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  id: string

  /**
   * Event name
   * @example "Air Quality 2026"
   */
  name: string

  /**
   * The channel the event uses the template for
   * @example "EMAIL"
   */
  channelCode: string
}

/**
 * Where a template is in use. An empty list means the template can be deleted.
 */
export class TemplateUsageResponseDto {
  events: TemplateUsageEventDto[]
}
