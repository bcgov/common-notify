import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { HEADER_CUSTOM_ID, useEmailHeader } from './useEmailHeader'
import type { ApprovedEmailLogo } from '@/interfaces/tenant-settings.interface'

const defaultLogo: ApprovedEmailLogo = {
  id: 'logo-default',
  name: 'BC Gov',
  displayTitle: null,
  isDefault: true,
  imageUrl: '/logos/default.png',
}
const unnamedLogo: ApprovedEmailLogo = {
  id: 'logo-unnamed',
  name: null,
  displayTitle: null,
  isDefault: false,
  imageUrl: '/logos/unnamed.png',
}

const notCustom = { useCustomHeader: false, headerLogoId: null, headerTitle: '' }

type Options = Parameters<typeof useEmailHeader>[0]

function renderEmailHeader(options: Partial<Options> = {}) {
  return renderHook((props: Options) => useEmailHeader(props), {
    initialProps: {
      saved: notCustom,
      approvedLogos: [],
      tenantShowsHeaderTitle: false,
      ...options,
    },
  })
}

describe('useEmailHeader', () => {
  it('labels the default logo and falls back for a logo without a name', () => {
    const { result } = renderEmailHeader({ approvedLogos: [defaultLogo, unnamedLogo] })

    expect(result.current.logoItems).toEqual([
      { id: 'logo-default', label: 'Main BC Mark (Default)' },
      { id: 'logo-unnamed', label: 'Unnamed logo' },
    ])
  })

  it('starts a saved custom header without a logo on the default logo', () => {
    const { result } = renderEmailHeader({
      saved: { useCustomHeader: true, headerLogoId: null, headerTitle: 'Permits' },
      approvedLogos: [defaultLogo],
    })

    expect(result.current.logoId).toBe('logo-default')
    expect(result.current.submitted).toEqual({
      useCustomHeader: true,
      headerLogoId: 'logo-default',
      headerTitle: 'Permits',
    })
  })

  it('seeds the logo and title from tenant settings that load after mount', () => {
    const { result, rerender } = renderEmailHeader()
    expect(result.current.logoId).toBeUndefined()
    expect(result.current.title).toBe('')

    rerender({
      saved: notCustom,
      approvedLogos: [defaultLogo],
      tenantShowsHeaderTitle: false,
      tenantName: 'Ministry of Forests',
    })

    expect(result.current.logoId).toBe('logo-default')
    expect(result.current.title).toBe('Ministry of Forests')
  })

  it('does not write the tenant name over a title the user has cleared', () => {
    const { result, rerender } = renderEmailHeader()

    act(() => result.current.editTitle(''))
    rerender({
      saved: notCustom,
      approvedLogos: [],
      tenantShowsHeaderTitle: false,
      tenantName: 'Ministry of Forests',
    })

    expect(result.current.title).toBe('')
  })

  it('submits no logo for a custom header when there are no logos at all', () => {
    const { result } = renderEmailHeader()

    act(() => result.current.setMode(HEADER_CUSTOM_ID))

    expect(result.current.previewLogo).toBeUndefined()
    expect(result.current.submitted.headerLogoId).toBeNull()
  })
})
