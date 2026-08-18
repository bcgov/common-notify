import { describe, expect, it } from 'vitest'
import smsSettingsReducer from './smsSettings.slice'
import { fetchSettings, updateSmsSettings } from '../thunks/settings.thunks'
import type { TenantSettings } from '@/interfaces/tenant-settings.interface'

describe('smsSettingsSlice', () => {
  // Mirrors the tenant_settings column defaults.
  const initialState = {
    smsNotificationsEnabled: true,
    includeTenantNameInSms: true,
    internationalSmsEnabled: false,
    saving: false,
  }

  const loadedState = {
    smsNotificationsEnabled: false,
    includeTenantNameInSms: false,
    internationalSmsEnabled: true,
    saving: false,
  }

  const tenantSettings: TenantSettings = {
    id: 'settings-1',
    tenantId: 'tenant-1',
    alertEmail: 'alerts@example.com',
    defaultSenderEmail: 'noreply',
    smsNotificationsEnabled: false,
    includeTenantNameInSms: false,
    internationalSmsEnabled: true,
    createdAt: '2026-07-21T00:00:00.000Z',
    createdBy: 'user-1',
    updatedAt: '2026-07-21T00:00:00.000Z',
    updatedBy: 'user-1',
    isDeleted: false,
  }

  it('should have initial state', () => {
    const state = smsSettingsReducer(undefined, { type: 'unknown' })

    expect(state).toEqual(initialState)
  })

  describe('fetchSettings thunk (shared across settings slices)', () => {
    it('should reset to defaults while a load is in flight', () => {
      const state = smsSettingsReducer(
        { ...loadedState, error: 'a stale save error' },
        fetchSettings.pending('', undefined, {}),
      )

      expect(state.smsNotificationsEnabled).toBe(true)
      expect(state.includeTenantNameInSms).toBe(true)
      expect(state.internationalSmsEnabled).toBe(false)
      expect(state.error).toBeUndefined()
    })

    it('should take its own fields from the shared payload', () => {
      const state = smsSettingsReducer(
        initialState,
        fetchSettings.fulfilled(tenantSettings, '', undefined),
      )

      expect(state.smsNotificationsEnabled).toBe(false)
      expect(state.includeTenantNameInSms).toBe(false)
      expect(state.internationalSmsEnabled).toBe(true)
    })

    it('should fall back to the column defaults when no settings row exists yet', () => {
      const state = smsSettingsReducer(loadedState, fetchSettings.fulfilled(null, '', undefined))

      expect(state.smsNotificationsEnabled).toBe(true)
      expect(state.includeTenantNameInSms).toBe(true)
      expect(state.internationalSmsEnabled).toBe(false)
    })

    // Load errors are surfaced by Settings.tsx, which owns the page-level gate.
    it('should leave values and saving untouched when the shared fetch rejects', () => {
      const state = smsSettingsReducer(
        loadedState,
        fetchSettings.rejected(new Error(), '', undefined, 'Failed to load settings'),
      )

      expect(state).toEqual(loadedState)
    })
  })

  describe('updateSmsSettings thunk', () => {
    const payload = {
      smsNotificationsEnabled: false,
      includeTenantNameInSms: false,
      internationalSmsEnabled: true,
    }

    it('should handle pending state', () => {
      const state = smsSettingsReducer(initialState, updateSmsSettings.pending('', payload, {}))

      expect(state.saving).toBe(true)
      expect(state.error).toBeUndefined()
    })

    it('should handle fulfilled state', () => {
      const state = smsSettingsReducer(
        { ...initialState, saving: true },
        updateSmsSettings.fulfilled(tenantSettings, '', payload),
      )

      expect(state.smsNotificationsEnabled).toBe(false)
      expect(state.includeTenantNameInSms).toBe(false)
      expect(state.internationalSmsEnabled).toBe(true)
      expect(state.saving).toBe(false)
    })

    it('should handle rejected state', () => {
      const error = 'Failed to update SMS settings'
      const state = smsSettingsReducer(
        { ...initialState, saving: true },
        updateSmsSettings.rejected(new Error(), '', payload, error),
      )

      expect(state.saving).toBe(false)
      expect(state.error).toBe(error)
    })
  })
})
