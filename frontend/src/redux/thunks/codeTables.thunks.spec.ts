import { describe, it, expect, beforeEach, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import { fetchCodeTables } from '@/redux/thunks/codeTables.thunks'
import * as api from '@/common/api'
import codeTablesReducer from '@/redux/slices/codeTables.slice'

vi.mock('@/common/api', () => ({
  get: vi.fn(),
  generateApiParameters: vi.fn((path: string) => ({ url: path })),
}))

describe('codeTables.thunks', () => {
  let store: ReturnType<typeof configureStore>

  beforeEach(() => {
    vi.clearAllMocks()
    store = configureStore({
      reducer: {
        codeTables: codeTablesReducer,
      },
    })
  })

  describe('fetchCodeTables', () => {
    it('should fetch and transform code tables successfully', async () => {
      const mockStatusesData = [
        { code: 'sent', displayName: 'Sent', description: 'Sent notification was sent' },
        { code: 'failed', displayName: 'Failed', description: 'Notification delivery failed' },
        { code: 'pending', displayName: 'Pending', description: 'Notification is pending' },
      ]
      const mockChannelsData = [
        { code: 'EMAIL', displayName: 'Email', description: 'Email notification channel' },
        { code: 'SMS', displayName: 'SMS', description: 'SMS notification channel' },
      ]
      const mockEventTypesData = [
        {
          code: 'PASSWORD_RESET',
          displayName: 'Password Reset',
          description: 'User password reset event',
        },
        { code: 'INVOICE_SENT', displayName: 'Invoice Sent', description: 'Invoice sent to user' },
      ]

      ;(api.get as any).mockResolvedValueOnce(mockStatusesData)
      ;(api.get as any).mockResolvedValueOnce(mockChannelsData)
      ;(api.get as any).mockResolvedValueOnce(mockEventTypesData)

      await (store.dispatch as any)(fetchCodeTables())

      const state = (store.getState() as any).codeTables
      expect(state.statuses).toHaveLength(3)
      expect(state.channels).toHaveLength(2)
      expect(state.eventTypes).toHaveLength(2)
      expect(state.statuses[0]).toEqual({
        id: 'sent',
        label: 'Sent',
        description: 'Sent notification was sent',
      })
    })

    it('should handle API error for statuses', async () => {
      ;(api.get as any).mockRejectedValueOnce(new Error('Network error'))

      await (store.dispatch as any)(fetchCodeTables())

      const state = (store.getState() as any).codeTables
      expect(state.isLoading).toBe(false)
      expect(state.error).toBe('Network error')
    })

    it('should handle API error for channels', async () => {
      const mockStatusesData = [
        { id: 'sent', label: 'Sent', description: 'Sent notification was sent' },
        { id: 'failed', label: 'Failed', description: 'Notification delivery failed' },
        { id: 'pending', label: 'Pending', description: 'Notification is pending' },
      ]

      ;(api.get as any).mockResolvedValueOnce(mockStatusesData)
      ;(api.get as any).mockRejectedValueOnce(new Error('Channel fetch failed'))

      await (store.dispatch as any)(fetchCodeTables())

      const state = (store.getState() as any).codeTables
      expect(state.error).toBe('Channel fetch failed')
    })

    it('should make correct API calls', async () => {
      const mockStatusesData = [
        { id: 'sent', label: 'Sent', description: 'Sent notification was sent' },
        { id: 'failed', label: 'Failed', description: 'Notification delivery failed' },
        { id: 'pending', label: 'Pending', description: 'Notification is pending' },
      ]
      const mockChannelsData = [
        { id: 'EMAIL', label: 'Email', description: 'Email notification channel' },
        { id: 'SMS', label: 'SMS', description: 'SMS notification channel' },
      ]
      const mockEventTypesData = [
        { id: 'PASSWORD_RESET', label: 'Password Reset', description: 'User password reset event' },
        { id: 'INVOICE_SENT', label: 'Invoice Sent', description: 'Invoice sent to user' },
      ]

      ;(api.get as any)
        .mockResolvedValueOnce(mockStatusesData)
        .mockResolvedValueOnce(mockChannelsData)
        .mockResolvedValueOnce(mockEventTypesData)

      await (store.dispatch as any)(fetchCodeTables())

      expect(api.get as any).toHaveBeenCalledTimes(3)
      expect(api.generateApiParameters as any).toHaveBeenCalledWith(
        '/api/v1/frontend/code-tables/notification-status',
      )
      expect(api.generateApiParameters as any).toHaveBeenCalledWith(
        '/api/v1/frontend/code-tables/channels',
      )
      expect(api.generateApiParameters as any).toHaveBeenCalledWith(
        '/api/v1/frontend/code-tables/event-types',
      )
    })
  })
})
