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
        { code: 'sent', description: 'Sent' },
        { code: 'failed', description: 'Failed' },
        { code: 'pending', description: 'Pending' },
      ]
      const mockChannelsData = [
        { channel_code: 'EMAIL', description: 'Email' },
        { channel_code: 'SMS', description: 'SMS' },
      ]
      const mockEventTypesData = [
        { event_type_code: 'PASSWORD_RESET', description: 'Password Reset' },
        { event_type_code: 'INVOICE_SENT', description: 'Invoice Sent' },
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
        description: 'sent',
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
        { code: 'sent', description: 'Sent' },
        { code: 'failed', description: 'Failed' },
        { code: 'pending', description: 'Pending' },
      ]

      ;(api.get as any).mockResolvedValueOnce(mockStatusesData)
      ;(api.get as any).mockRejectedValueOnce(new Error('Channel fetch failed'))

      await (store.dispatch as any)(fetchCodeTables())

      const state = (store.getState() as any).codeTables
      expect(state.error).toBe('Channel fetch failed')
    })

    it('should make correct API calls', async () => {
      const mockStatusesData = [
        { code: 'sent', description: 'Sent' },
        { code: 'failed', description: 'Failed' },
        { code: 'pending', description: 'Pending' },
      ]
      const mockChannelsData = [
        { channel_code: 'EMAIL', description: 'Email' },
        { channel_code: 'SMS', description: 'SMS' },
      ]
      const mockEventTypesData = [
        { event_type_code: 'PASSWORD_RESET', description: 'Password Reset' },
        { event_type_code: 'INVOICE_SENT', description: 'Invoice Sent' },
      ]

      ;(api.get as any)
        .mockResolvedValueOnce(mockStatusesData)
        .mockResolvedValueOnce(mockChannelsData)
        .mockResolvedValueOnce(mockEventTypesData)

      await (store.dispatch as any)(fetchCodeTables())

      expect(api.get as any).toHaveBeenCalledTimes(3)
      expect(api.generateApiParameters as any).toHaveBeenCalledWith(
        '/api/v1/code-tables/notification-status',
      )
      expect(api.generateApiParameters as any).toHaveBeenCalledWith('/api/v1/code-tables/channels')
      expect(api.generateApiParameters as any).toHaveBeenCalledWith(
        '/api/v1/code-tables/event-types',
      )
    })
  })
})
