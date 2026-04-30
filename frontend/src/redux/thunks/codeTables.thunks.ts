import { createAsyncThunk } from '@reduxjs/toolkit'
import type { CodeTablesState } from '@/interfaces/CodeTables'
import { get, generateApiParameters } from '@/common/api'

/**
 * Fetch all code tables (statuses, channels, event types) from the API
 * This populates dropdowns and filters throughout the app
 */
export const fetchCodeTables = createAsyncThunk<
  CodeTablesState,
  void,
  {
    rejectValue: string
  }
>('codeTables/fetchCodeTables', async (_, { rejectWithValue }) => {
  try {
    // Fetch all code tables in parallel for better performance
    const [statuses_data, channels_data, eventTypes_data] = await Promise.all([
      get<any[]>(generateApiParameters('/api/v1/code-tables/notification-status')),
      get<any[]>(generateApiParameters('/api/v1/code-tables/channels')),
      get<any[]>(generateApiParameters('/api/v1/code-tables/event-types')),
    ])

    // Map notification statuses
    const statuses = statuses_data.map((item: any) => ({
      id: item.code,
      label: item.description,
      description: item.code,
    }))

    // Map notification channels
    const channels = channels_data.map((item: any) => ({
      id: item.channel_code,
      label: item.description,
      description: item.channel_code,
    }))

    // Map notification event types
    const eventTypes = eventTypes_data.map((item: any) => ({
      id: item.event_type_code,
      label: item.description,
      description: item.event_type_code,
    }))

    return {
      statuses,
      channels,
      eventTypes,
      isLoading: false,
      error: null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch code tables'
    return rejectWithValue(message)
  }
})
