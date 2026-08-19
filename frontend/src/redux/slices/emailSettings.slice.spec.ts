import { describe, expect, it } from 'vitest'
import emailSettingsReducer from './emailSettings.slice'
import { fetchSettings, updateEmailSettings } from '../thunks/settings.thunks'
import type { TenantSettings } from '@/interfaces/tenant-settings.interface'

describe('emailSettingsSlice', () => {
  // Mirrors the tenant_settings column defaults.
  const initialState = {
    emailNotificationsEnabled: true,
    replyToEmail: null,
    emailAttachmentsEnabled: true,
    saving: false,
  }

  const loadedState = {
    emailNotificationsEnabled: false,
    replyToEmail: 'noreply',
    emailAttachmentsEnabled: false,
    saving: false,
  }

  const tenantSettings: TenantSettings = {
    id: 'settings-1',
    tenantId: 'tenant-1',
    alertEmail: 'alerts@example.com',
    defaultSenderEmail: 'noreply',
    emailNotificationsEnabled: false,
    replyToEmail: 'noreply',
    emailAttachmentsEnabled: false,
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
    const state = emailSettingsReducer(undefined, { type: 'unknown' })

    expect(state).toEqual(initialState)
  })

  describe('fetchSettings thunk (shared across settings slices)', () => {
    it('should reset to defaults while a load is in flight', () => {
      const state = emailSettingsReducer(
        { ...loadedState, error: 'a stale save error' },
        fetchSettings.pending('', undefined, {}),
      )

      expect(state.emailNotificationsEnabled).toBe(true)
      expect(state.replyToEmail).toBeNull()
      expect(state.emailAttachmentsEnabled).toBe(true)
      expect(state.error).toBeUndefined()
    })

    it('should take its own fields from the shared payload', () => {
      const state = emailSettingsReducer(
        initialState,
        fetchSettings.fulfilled(tenantSettings, '', undefined),
      )

      expect(state.emailNotificationsEnabled).toBe(false)
      expect(state.replyToEmail).toBe('noreply')
      expect(state.emailAttachmentsEnabled).toBe(false)
    })

    it('should fall back to the column defaults when no settings row exists yet', () => {
      const state = emailSettingsReducer(loadedState, fetchSettings.fulfilled(null, '', undefined))

      expect(state.emailNotificationsEnabled).toBe(true)
      expect(state.replyToEmail).toBeNull()
      expect(state.emailAttachmentsEnabled).toBe(true)
    })

    // Load errors are surfaced by Settings.tsx, which owns the page-level gate.
    it('should leave values and saving untouched when the shared fetch rejects', () => {
      const state = emailSettingsReducer(
        loadedState,
        fetchSettings.rejected(new Error(), '', undefined, 'Failed to load settings'),
      )

      expect(state).toEqual(loadedState)
    })
  })

  describe('updateEmailSettings thunk', () => {
    const payload = {
      emailNotificationsEnabled: false,
      replyToEmail: 'noreply',
      emailAttachmentsEnabled: false,
    }

    it('should handle pending state', () => {
      const state = emailSettingsReducer(initialState, updateEmailSettings.pending('', payload, {}))

      expect(state.saving).toBe(true)
      expect(state.error).toBeUndefined()
    })

    it('should handle fulfilled state', () => {
      const state = emailSettingsReducer(
        { ...initialState, saving: true },
        updateEmailSettings.fulfilled(tenantSettings, '', payload),
      )

      expect(state.emailNotificationsEnabled).toBe(false)
      expect(state.replyToEmail).toBe('noreply')
      expect(state.emailAttachmentsEnabled).toBe(false)
      expect(state.saving).toBe(false)
    })

    it('should handle rejected state', () => {
      const error = 'Failed to update email settings'
      const state = emailSettingsReducer(
        { ...initialState, saving: true },
        updateEmailSettings.rejected(new Error(), '', payload, error),
      )

      expect(state.saving).toBe(false)
      expect(state.error).toBe(error)
    })
  })
})
