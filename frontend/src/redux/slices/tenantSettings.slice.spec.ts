import { describe, expect, it } from 'vitest'
import tenantSettingsReducer from './tenantSettings.slice'
import { fetchTenantSettings, updateTenantSettings } from '../thunks/tenantSettings.thunks'
import type { TenantSettings } from '@/interfaces/tenant-settings.interface'

describe('tenantSettingsSlice', () => {
  const initialState = {
    alertEmail: null,
    defaultSenderEmail: null,
    loading: false,
    saving: false,
  }

  const tenantSettings: TenantSettings = {
    id: 'settings-1',
    tenantId: 'tenant-1',
    alertEmail: 'alerts@example.com',
    defaultSenderEmail: 'noreply',
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

  describe('fetchTenantSettings thunk', () => {
    it('should handle pending state', () => {
      const state = tenantSettingsReducer(
        initialState,
        fetchTenantSettings.pending('', undefined, {}),
      )

      expect(state.loading).toBe(true)
      expect(state.error).toBeUndefined()
    })

    it('should handle fulfilled state', () => {
      const state = tenantSettingsReducer(
        { ...initialState, loading: true },
        fetchTenantSettings.fulfilled(tenantSettings, '', undefined),
      )

      expect(state.alertEmail).toBe('alerts@example.com')
      expect(state.defaultSenderEmail).toBe('noreply')
      expect(state.loading).toBe(false)
    })

    it('should handle rejected state', () => {
      const error = 'Failed to load tenant settings'
      const state = tenantSettingsReducer(
        { ...initialState, loading: true },
        fetchTenantSettings.rejected(new Error(), '', undefined, error),
      )

      expect(state.loading).toBe(false)
      expect(state.error).toBe(error)
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
      expect(state.loading).toBe(false)
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
