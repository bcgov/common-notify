import { useEffect, useRef, useState } from 'react'
import { resolveEmailHeaderTitle } from '@/utils/emailHeaderTitle'
import type { ApprovedEmailLogo } from '@/interfaces/tenant-settings.interface'

export const HEADER_TENANT_DEFAULT_ID = 'tenant-default'
export const HEADER_CUSTOM_ID = 'custom'

type UseEmailHeaderOptions = {
  /** The header the event was saved with. */
  saved: { useCustomHeader: boolean; headerLogoId: string | null; headerTitle: string }
  approvedLogos: ApprovedEmailLogo[]
  tenantEmailLogoId?: string | null
  tenantShowsHeaderTitle: boolean
  tenantName?: string | null
}

/** The email tab's header settings, their tenant defaults, and the preview they produce. */
export function useEmailHeader({
  saved,
  approvedLogos,
  tenantEmailLogoId,
  tenantShowsHeaderTitle,
  tenantName,
}: UseEmailHeaderOptions) {
  // A saved custom header is shown as saved; otherwise the fields start on the tenant's own logo
  // and name, so switching to Custom opens on a sensible default rather than empty controls.
  const [mode, setMode] = useState(
    saved.useCustomHeader ? HEADER_CUSTOM_ID : HEADER_TENANT_DEFAULT_ID,
  )
  const defaultLogoId = tenantEmailLogoId ?? approvedLogos.find((logo) => logo.isDefault)?.id
  const [logoId, setLogoId] = useState<string | undefined>(
    saved.useCustomHeader ? (saved.headerLogoId ?? defaultLogoId) : defaultLogoId,
  )
  const [title, setTitle] = useState(saved.useCustomHeader ? saved.headerTitle : (tenantName ?? ''))
  // Clearing the header title is a deliberate choice (a custom header with no title), so the
  // tenant name must not be written back over an emptied field.
  const titleTouched = useRef(false)

  // Tenant settings can land after mount; seed the header defaults from them while both fields
  // are still untouched and no custom header has been saved.
  useEffect(() => {
    if (!logoId && defaultLogoId) {
      setLogoId(defaultLogoId)
    }
  }, [logoId, defaultLogoId])

  useEffect(() => {
    if (!titleTouched.current && !saved.useCustomHeader && !title && tenantName) {
      setTitle(tenantName)
    }
  }, [title, tenantName, saved.useCustomHeader])

  // For the user's own edits, which stop the tenant name being written back.
  function editTitle(value: string) {
    titleTouched.current = true
    setTitle(value)
  }

  const isCustom = mode === HEADER_CUSTOM_ID
  const logoItems = approvedLogos.map((logo) => ({
    id: logo.id,
    label: logo.isDefault ? 'Main BC Mark (Default)' : (logo.name ?? 'Unnamed logo'),
  }))
  // A custom header previews its own logo and title; the tenant default previews the tenant's
  // configured logo on its own.
  const previewLogoId = isCustom ? (logoId ?? defaultLogoId) : defaultLogoId
  const previewLogo = approvedLogos.find((logo) => logo.id === previewLogoId)
  const previewTitle = resolveEmailHeaderTitle({
    useCustomTitle: isCustom,
    customTitle: title,
    tenantShowsHeaderTitle,
    logoDisplayTitle: previewLogo?.displayTitle,
  })

  return {
    mode,
    setMode,
    logoId,
    setLogoId,
    title,
    editTitle,
    logoItems,
    previewLogo,
    previewTitle,
    /** The header fields as the save sends them. */
    submitted: {
      useCustomHeader: isCustom,
      // Custom headers always start with the tenant or system default logo.
      headerLogoId: isCustom ? (logoId ?? defaultLogoId ?? null) : null,
      headerTitle: isCustom ? title.trim() : '',
    },
  }
}

export type EmailHeader = ReturnType<typeof useEmailHeader>
