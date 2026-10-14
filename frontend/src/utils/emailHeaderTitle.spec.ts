import { describe, expect, it } from 'vitest'
import { DEFAULT_EMAIL_HEADER_TITLE, resolveEmailHeaderTitle } from './emailHeaderTitle'

describe('resolveEmailHeaderTitle', () => {
  it('uses a custom title when the event supplies one', () => {
    expect(
      resolveEmailHeaderTitle({
        useCustomTitle: true,
        customTitle: 'Permit Services',
        tenantShowsHeaderTitle: true,
        logoDisplayTitle: 'Ignored',
      }),
    ).toBe('Permit Services')
  })

  it('treats a missing custom title as empty rather than falling back to the logo', () => {
    expect(
      resolveEmailHeaderTitle({
        useCustomTitle: true,
        tenantShowsHeaderTitle: true,
        logoDisplayTitle: 'Ignored',
      }),
    ).toBe('')
  })

  it("uses the logo's own title when the tenant shows one", () => {
    expect(
      resolveEmailHeaderTitle({
        useCustomTitle: false,
        tenantShowsHeaderTitle: true,
        logoDisplayTitle: 'Ministry of Health',
      }),
    ).toBe('Ministry of Health')
  })

  it('falls back to the province when the logo has no title of its own', () => {
    expect(resolveEmailHeaderTitle({ useCustomTitle: false, tenantShowsHeaderTitle: true })).toBe(
      DEFAULT_EMAIL_HEADER_TITLE,
    )
    expect(
      resolveEmailHeaderTitle({
        useCustomTitle: false,
        tenantShowsHeaderTitle: true,
        logoDisplayTitle: '',
      }),
    ).toBe(DEFAULT_EMAIL_HEADER_TITLE)
  })

  it('shows no title when the tenant does not show one', () => {
    expect(
      resolveEmailHeaderTitle({
        useCustomTitle: false,
        tenantShowsHeaderTitle: false,
        logoDisplayTitle: 'Ministry of Health',
      }),
    ).toBe('')
  })
})
