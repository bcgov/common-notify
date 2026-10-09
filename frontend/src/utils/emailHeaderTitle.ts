/** Shown beside the header logo when a logo carries no display title of its own. */
export const DEFAULT_EMAIL_HEADER_TITLE = 'Government of British Columbia'

/**
 * The title an email header will show, as the Events tabs and their saved view both resolve it.
 *
 * Three cases, in order: a custom title the event supplies, the selected logo's own title when the
 * tenant shows one, and no title at all.
 */
export function resolveEmailHeaderTitle(options: {
  useCustomTitle: boolean
  /** Null as well as undefined: settings rows carry an unset title as null. */
  customTitle?: string | null
  tenantShowsHeaderTitle: boolean
  logoDisplayTitle?: string | null
}): string {
  if (options.useCustomTitle) return options.customTitle ?? ''
  if (options.tenantShowsHeaderTitle) {
    return options.logoDisplayTitle || DEFAULT_EMAIL_HEADER_TITLE
  }
  return ''
}
