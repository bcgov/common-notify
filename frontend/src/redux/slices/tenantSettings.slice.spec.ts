import { describe, expect, it } from 'vitest'
import tenantSettingsReducer from './tenantSettings.slice'
import { fetchSettings, updateTenantSettings } from '../thunks/settings.thunks'
import type { TenantSettings } from '@/interfaces/tenant-settings.interface'

describe('tenantSettingsSlice', () => {
  const initialState = {
    alertEmail: null,
    defaultSenderEmail: null,
    saving: false,
  }

  const loadedState = {
    alertEmail: 'alerts@example.com',
    defaultSenderEmail: 'noreply',
    saving: false,
  }

  const tenantSettings: TenantSettings = {
    id: 'settings-1',
    tenantId: 'tenant-1',
    alertEmail: 'alerts@example.com',
    defaultSenderEmail: 'noreply',
    smsNotificationsEnabled: true,
    includeTenantNameInSms: true,
    internationalSmsEnabled: false,
    createdAt: '2026-07-21T00:00:00.000Z',
    createdBy: 'user-1',
    updatedAt: '2026-07-21T00:00:00.000Z',
    updatedBy: 'user-1',
    isDeleted: false,
  }

  it('should have initial state', () => {
    const state = tenantSettingsReducer(undefined, { type: 'unknown' })

    expect(state).toEqual(initialState)
  })

  describe('fetchSettings thunk (shared across settings slices)', () => {
    it('should clear the previous tenant values while a load is in flight', () => {
      const state = tenantSettingsReducer(
        { ...loadedState, error: 'a stale save error' },
        fetchSettings.pending('', undefined, {}),
      )

      expect(state.alertEmail).toBeNull()
      expect(state.defaultSenderEmail).toBeNull()
      expect(state.error).toBeUndefined()
    })

    it('should take its own fields from the shared payload', () => {
      const state = tenantSettingsReducer(
        initialState,
        fetchSettings.fulfilled(tenantSettings, '', undefined),
      )

      expect(state.alertEmail).toBe('alerts@example.com')
      expect(state.defaultSenderEmail).toBe('noreply')
    })

    it('should fall back to defaults when no settings row exists yet', () => {
      const state = tenantSettingsReducer(
        loadedState,
        fetchSettings.fulfilled(null, '', undefined),
      )

      expect(state.alertEmail).toBeNull()
      expect(state.defaultSenderEmail).toBeNull()
    })

    // Load errors are surfaced by Settings.tsx, which owns the page-level gate; storing
    // them here too would duplicate the message with no rule about which one renders.
    it('should leave values and saving untouched when the shared fetch rejects', () => {
      const state = tenantSettingsReducer(
        loadedState,
        fetchSettings.rejected(new Error(), '', undefined, 'Failed to load settings'),
      )

      expect(state).toEqual(loadedState)
    })
  })

  describe('updateTenantSettings thunk', () => {
    it('should handle pending state', () => {
      const state = tenantSettingsReducer(
        initialState,
        updateTenantSettings.pending(
          '',
          { alertEmail: 'alerts@example.com', defaultSenderEmail: 'noreply' },
          {},
        ),
      )

      expect(state.saving).toBe(true)
      expect(state.error).toBeUndefined()
    })

    it('should handle fulfilled state', () => {
      const payload = {
        ...tenantSettings,
        alertEmail: 'updated@example.com',
        defaultSenderEmail: 'no-reply',
      }
      const state = tenantSettingsReducer(
        { ...initialState, saving: true },
        updateTenantSettings.fulfilled(payload, '', {
          alertEmail: 'updated@example.com',
          defaultSenderEmail: 'no-reply',
        }),
      )

      expect(state.alertEmail).toBe('updated@example.com')
      expect(state.defaultSenderEmail).toBe('no-reply')
      expect(state.saving).toBe(false)
    })

    it('should handle rejected state', () => {
      const error = 'Failed to update tenant settings'
      const state = tenantSettingsReducer(
        { ...initialState, saving: true },
        updateTenantSettings.rejected(
          new Error(),
          '',
          { alertEmail: 'alerts@example.com', defaultSenderEmail: 'noreply' },
          error,
        ),
      )

      expect(state.saving).toBe(false)
      expect(state.error).toBe(error)
    })
  })
})
