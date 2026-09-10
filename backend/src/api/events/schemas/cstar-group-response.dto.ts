/**
 * A CSTAR group the tenant can address a notification to, as offered by the Email
 * Notification tab's group picker.
 */
export class CstarGroupResponseDto {
  /**
   * CSTAR group ID, which is what an event stores
   * @example "3a3fafee-d41b-4fbe-92df-62dbebf0f73a"
   */
  id: string

  /**
   * Group name, shown in the picker
   * @example "Development Team"
   */
  name: string

  /**
   * Group description. Empty string when CSTAR has none.
   * @example "Group for development team members"
   */
  description: string
}

/**
 * DTO for the tenant's CSTAR groups
 */
export class CstarGroupListResponseDto {
  /**
   * The groups defined in the authenticated tenant. Empty when the tenant has none.
   */
  groups: CstarGroupResponseDto[]
}
