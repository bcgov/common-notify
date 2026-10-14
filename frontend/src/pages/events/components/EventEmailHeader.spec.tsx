import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import EventEmailHeader from './EventEmailHeader'
import emailSettingsReducer from '@/redux/slices/emailSettings.slice'
import tenantReducer from '@/redux/slices/tenant.slice'
import type { EventEmailSettings } from '@/api/events.api'
import type { ApprovedEmailLogo } from '@/interfaces/tenant-settings.interface'

const defaultLogo: ApprovedEmailLogo = {
  id: 'logo-default',
  name: 'BC Gov',
  displayTitle: null,
  isDefault: true,
  imageUrl: '/logos/default.png',
}
const tenantLogo: ApprovedEmailLogo = {
  id: 'logo-tenant',
  name: 'Tenant',
  displayTitle: 'Ministry of Forests',
  isDefault: false,
  imageUrl: '/logos/tenant.png',
}
const eventLogo: ApprovedEmailLogo = {
  id: 'logo-event',
  name: 'Event',
  displayTitle: 'Wildfire Service',
  isDefault: false,
  imageUrl: '/logos/event.png',
}

const emailSettings: EventEmailSettings = {
  active: true,
  senderEmail: 'permits@gov.bc.ca',
  templateId: 'template-1',
  to: [],
  cc: [],
  bcc: [],
  cstarGroupIdsTo: [],
  cstarGroupIdsCc: [],
  cstarGroupIdsBcc: [],
  useCustomHeader: false,
  headerLogoId: null,
  headerTitle: null,
}

// No tenant is selected, so the header reads the store as given and fetches nothing.
function renderHeader(
  overrides: Partial<EventEmailSettings> = {},
  tenant: { emailLogoId?: string | null; useCustomEmailHeader?: boolean } = {},
) {
  const store = configureStore({
    reducer: { emailSettings: emailSettingsReducer, tenant: tenantReducer },
    preloadedState: {
      emailSettings: {
        ...emailSettingsReducer(undefined, { type: 'init' }),
        emailLogoId: tenant.emailLogoId ?? null,
        useCustomEmailHeader: tenant.useCustomEmailHeader ?? false,
        approvedLogos: [defaultLogo, tenantLogo, eventLogo],
      },
    },
  })

  return render(
    <Provider store={store}>
      <EventEmailHeader emailSettings={{ ...emailSettings, ...overrides }} />
    </Provider>,
  )
}

// Queried directly rather than by role: beside a title the logo is decorative (alt=""), which
// takes it out of the accessibility tree.
const logo = () => document.querySelector('img')

describe('EventEmailHeader', () => {
  describe('the tenant default header', () => {
    it("shows the tenant's logo", () => {
      renderHeader({}, { emailLogoId: 'logo-tenant' })

      expect(logo()).toHaveAttribute('src', '/logos/tenant.png')
    })

    it('shows the default logo when the tenant has none', () => {
      renderHeader()

      expect(logo()).toHaveAttribute('src', '/logos/default.png')
    })

    it("shows the logo's title beside it when the tenant shows titles", () => {
      renderHeader({}, { emailLogoId: 'logo-tenant', useCustomEmailHeader: true })

      expect(screen.getByText('Ministry of Forests')).toBeInTheDocument()
      // The title says what the logo shows, so the image is decorative.
      expect(logo()).toHaveAttribute('alt', '')
    })

    it('falls back to the government title for a logo with none of its own', () => {
      renderHeader({}, { useCustomEmailHeader: true })

      expect(screen.getByText('Government of British Columbia')).toBeInTheDocument()
    })

    it('shows the logo alone, named by its alt text, when the tenant hides titles', () => {
      renderHeader({}, { emailLogoId: 'logo-tenant' })

      expect(screen.queryByText('Ministry of Forests')).not.toBeInTheDocument()
      expect(logo()).toHaveAttribute('alt', 'Ministry of Forests')
    })
  })

  describe('a custom header', () => {
    it('shows its own logo and title', () => {
      renderHeader(
        { useCustomHeader: true, headerLogoId: 'logo-event', headerTitle: 'Permits' },
        { emailLogoId: 'logo-tenant' },
      )

      expect(logo()).toHaveAttribute('src', '/logos/event.png')
      expect(screen.getByText('Permits')).toBeInTheDocument()
    })

    it("inherits the tenant's logo when it has none", () => {
      renderHeader(
        { useCustomHeader: true, headerTitle: 'Permits' },
        { emailLogoId: 'logo-tenant' },
      )

      expect(logo()).toHaveAttribute('src', '/logos/tenant.png')
    })

    it('inherits the default logo when neither it nor the tenant has one', () => {
      renderHeader({ useCustomHeader: true, headerTitle: 'Permits' })

      expect(logo()).toHaveAttribute('src', '/logos/default.png')
    })

    it("shows no title when it has none, even where the tenant shows the logo's", () => {
      renderHeader(
        { useCustomHeader: true, headerLogoId: 'logo-event' },
        { useCustomEmailHeader: true },
      )

      expect(screen.queryByText('Wildfire Service')).not.toBeInTheDocument()
    })
  })
})
