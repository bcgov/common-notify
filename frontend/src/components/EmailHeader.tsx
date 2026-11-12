import { useEffect } from 'react'
import type { FC } from 'react'
import type { EventEmailSettings } from '@/api/events.api'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchApprovedEmailLogos, fetchSettings } from '@/redux/thunks/settings.thunks'
import { DEFAULT_EMAIL_HEADER_TITLE, resolveEmailHeaderTitle } from '@/utils/emailHeaderTitle'
import '@/scss/components/email-header.scss'

interface EmailHeaderProps {
  /**
   * Only the header fields, so a tab can preview header settings it hasn't saved yet. A send with
   * no event behind it passes `useCustomHeader: false` to get the tenant's header.
   */
  emailSettings: Pick<EventEmailSettings, 'useCustomHeader' | 'headerLogoId' | 'headerTitle'>
}

/**
 * The banner an email is sent under, above the template body.
 *
 * Its own component because the header appears in several previews - the card on the event page,
 * and the modals for events and batch sends - and all need the same logo lookup.
 */
const EmailHeader: FC<EmailHeaderProps> = ({ emailSettings }) => {
  const dispatch = useAppDispatch()
  const approvedLogos = useAppSelector((state) => state.emailSettings.approvedLogos)
  const tenantEmailLogoId = useAppSelector((state) => state.emailSettings.emailLogoId)
  const tenantShowsHeaderTitle = useAppSelector(
    (state) => state.emailSettings.useCustomEmailHeader ?? false,
  )
  const selectedTenantId = useAppSelector((state) => state.tenant.selectedTenant?.id)

  // The header is previewed from the tenant's logo, the same as on the email tab. Both thunks
  // return early without a selected tenant, so they wait for one and re-run when it changes.
  useEffect(() => {
    if (!selectedTenantId) return

    void dispatch(fetchSettings())
    void dispatch(fetchApprovedEmailLogos())
  }, [dispatch, selectedTenantId])

  // Resolved as the backend resolves it at send time: a custom header without a logo inherits
  // the tenant's, and a tenant without one gets the default logo.
  const useCustomHeader = emailSettings.useCustomHeader
  const headerLogoId = useCustomHeader
    ? (emailSettings.headerLogoId ?? tenantEmailLogoId)
    : tenantEmailLogoId
  const headerLogo =
    approvedLogos.find((logo) => logo.id === headerLogoId) ??
    approvedLogos.find((logo) => logo.isDefault)
  const headerTitle = resolveEmailHeaderTitle({
    useCustomTitle: useCustomHeader,
    customTitle: emailSettings.headerTitle,
    tenantShowsHeaderTitle,
    logoDisplayTitle: headerLogo?.displayTitle,
  })
  // A title beside the logo already says what it shows; on its own the logo has to say it.
  const logoAlt = headerTitle ? '' : headerLogo?.displayTitle?.trim() || DEFAULT_EMAIL_HEADER_TITLE

  if (!headerLogo && !headerTitle) return null

  return (
    <div className="email-header">
      {headerLogo && (
        <img
          alt={logoAlt}
          className="email-header__logo"
          loading="lazy"
          src={headerLogo.imageUrl}
        />
      )}
      {headerTitle && <span className="email-header__title">{headerTitle}</span>}
    </div>
  )
}

export default EmailHeader
