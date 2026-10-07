import { useEffect } from 'react'
import type { FC } from 'react'
import type { EventEmailSettings } from '@/api/events.api'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchApprovedEmailLogos, fetchSettings } from '@/redux/thunks/settings.thunks'

interface EventEmailHeaderProps {
  emailSettings: EventEmailSettings
}

/**
 * The banner an event's email is sent under, above the template body.
 *
 * Its own component because the header appears in two previews - the card on the page and the
 * modal over it - and both need the same logo lookup.
 */
const EventEmailHeader: FC<EventEmailHeaderProps> = ({ emailSettings }) => {
  const dispatch = useAppDispatch()
  const approvedLogos = useAppSelector((state) => state.emailSettings.approvedLogos)
  const tenantEmailLogoId = useAppSelector((state) => state.emailSettings.emailLogoId)
  const selectedTenantId = useAppSelector((state) => state.tenant.selectedTenant?.id)

  // The header is previewed from the tenant's logo, the same as on the email tab. Both thunks
  // return early without a selected tenant, so they wait for one and re-run when it changes.
  useEffect(() => {
    if (!selectedTenantId) return

    dispatch(fetchSettings())
    dispatch(fetchApprovedEmailLogos())
  }, [dispatch, selectedTenantId])

  // A custom header shows its own logo and title; the tenant default shows the tenant's
  // configured logo on its own.
  const useCustomHeader = emailSettings.useCustomHeader
  const headerLogoId = useCustomHeader ? emailSettings.headerLogoId : tenantEmailLogoId
  const headerLogo = approvedLogos.find((logo) => logo.id === headerLogoId)
  const headerTitle = useCustomHeader ? (emailSettings.headerTitle ?? '') : ''

  if (!headerLogo && !headerTitle) return null

  return (
    <div className="events__header-preview-row">
      {headerLogo && (
        <img
          alt=""
          className="events__header-preview-logo"
          loading="lazy"
          src={headerLogo.imageUrl}
        />
      )}
      {headerTitle && <span className="events__header-preview-title">{headerTitle}</span>}
    </div>
  )
}

export default EventEmailHeader
