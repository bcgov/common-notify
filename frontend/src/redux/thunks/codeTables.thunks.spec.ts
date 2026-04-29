import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchCodeTables } from '@/redux/thunks/codeTables.thunks'
import * as api from '@/service/api'

vi.mock('@/service/api')

describe('codeTables.thunks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchCodeTables', () => {
    const mockStatusesResponse = {
      data: {
        data: [
          { code: 'sent', description: 'Sent' },
          { code: 'failed', description: 'Failed' },
          { code: 'pending', description: 'Pending' },
        ],
      },
    }

    const mockChannelsResponse = {
      data: {
        data: [
          { channel_code: 'EMAIL', description: 'Email' },
          { channel_code: 'SMS', description: 'SMS' },
        ],
      },
    }

    const mockEventTypesResponse = {
      data: {
        data: [
          { event_type_code: 'PASSWORD_RESET', description: 'Password Reset' },
          { event_type_code: 'INVOICE_SENT', description: 'Invoice Sent' },
        ],
      },
    }

    it('should fetch and transform code tables successfully', async () => {
      const mockApiClient = {
        get: vi.fn(),
      }
      vi.mocked(api.apiClient, true).get = mockApiClient.get

      mockApiClient.get
        .mockResolvedValueOnce(mockStatusesResponse)
        .mockResolvedValueOnce(mockChannelsResponse)
        .mockResolvedValueOnce(mockEventTypesResponse)

      const thunk = fetchCodeTables()
      const result = await thunk(async (fn) => fn())

      expect(result.payload).toBeDefined()
      expect(result.payload.statuses).toHaveLength(3)
      expect(result.payload.channels).toHaveLength(2)
      expect(result.payload.eventTypes).toHaveLength(2)

      // Verify transformation
      expect(result.payload.statuses[0]).toEqual({
        id: 'sent',
        label: 'Sent',
        description: 'sent',
      })
      expect(result.payload.channels[0]).toEqual({
        id: 'EMAIL',
        label: 'Email',
        description: 'EMAIL',
      })
      expect(result.payload.eventTypes[0]).toEqual({
        id: 'PASSWORD_RESET',
        label: 'Password Reset',
        description: 'PASSWORD_RESET',
      })

      expect(result.payload.isLoading).toBe(false)
      expect(result.payload.error).toBeNull()
    })

    it('should handle API error for statuses', async () => {
      const mockApiClient = {
        get: vi.fn(),
      }
      vi.mocked(api.apiClient, true).get = mockApiClient.get

      mockApiClient.get.mockRejectedValueOnce(new Error('Network error'))

      const thunk = fetchCodeTables()
      const result = await thunk(async (fn) => fn())

      expect(result.type).toBe('codeTables/fetchCodeTables/rejected')
      expect(result.payload).toBe('Network error')
    })

    it('should handle API error for channels', async () => {
      const mockApiClient = {
        get: vi.fn(),
      }
      vi.mocked(api.apiClient, true).get = mockApiClient.get

      mockApiClient.get
        .mockResolvedValueOnce(mockStatusesResponse)
        .mockRejectedValueOnce(new Error('Channel fetch failed'))

      const thunk = fetchCodeTables()
      const result = await thunk(async (fn) => fn())

      expect(result.type).toBe('codeTables/fetchCodeTables/rejected')
      expect(result.payload).toBe('Channel fetch failed')
    })

    it('should handle unknown error', async () => {
      const mockApiClient = {
        get: vi.fn(),
      }
      vi.mocked(api.apiClient, true).get = mockApiClient.get

      mockApiClient.get.mockRejectedValueOnce('Unknown error')

      const thunk = fetchCodeTables()
      const result = await thunk(async (fn) => fn())

      expect(result.type).toBe('codeTables/fetchCodeTables/rejected')
      expect(result.payload).toBe('Failed to fetch code tables')
    })

    it('should make correct API calls', async () => {
      const mockApiClient = {
        get: vi.fn(),
      }
      vi.mocked(api.apiClient, true).get = mockApiClient.get

      mockApiClient.get
        .mockResolvedValueOnce(mockStatusesResponse)
        .mockResolvedValueOnce(mockChannelsResponse)
        .mockResolvedValueOnce(mockEventTypesResponse)

      const thunk = fetchCodeTables()
      await thunk(async (fn) => fn())

      expect(mockApiClient.get).toHaveBeenCalledTimes(3)
      expect(mockApiClient.get).toHaveBeenNthCalledWith(
        1,
        '/api/v1/code-tables/notification-status',
      )
      expect(mockApiClient.get).toHaveBeenNthCalledWith(2, '/api/v1/code-tables/channels')
      expect(mockApiClient.get).toHaveBeenNthCalledWith(3, '/api/v1/code-tables/event-types')
    })
  })
})
