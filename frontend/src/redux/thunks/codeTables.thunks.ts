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
    // Fetch notification statuses
    const statuses_data = await get<any[]>(
      generateApiParameters('/api/v1/code-tables/notification-status'),
    )
    const statuses = statuses_data.map((item: any) => ({
      id: item.code,
      label: item.description,
      description: item.code,
    }))

    // Fetch notification channels
    const channels_data = await get<any[]>(generateApiParameters('/api/v1/code-tables/channels'))
    const channels = channels_data.map((item: any) => ({
      id: item.channel_code,
      label: item.description,
      description: item.channel_code,
    }))

    // Fetch notification event types
    const eventTypes_data = await get<any[]>(
      generateApiParameters('/api/v1/code-tables/event-types'),
    )
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
