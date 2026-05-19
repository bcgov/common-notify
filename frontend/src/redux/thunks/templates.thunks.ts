import { createAsyncThunk } from '@reduxjs/toolkit'
import { getTemplates } from '@/api/templates.api'
import type { PaginatedTemplateResponse } from '@/interfaces/PaginatedNotificationResponse'
import type { RootState } from '../store'

export const fetchTemplates = createAsyncThunk<
  PaginatedTemplateResponse,
  void,
  { state: RootState; rejectValue: string }
>('templates/fetchAll', async (_, { getState, rejectWithValue }) => {
  try {
    const state = getState()
    const tenantId = state.tenant.selectedTenant?.id
    if (!tenantId) return { data: [], count: 0, page: 1, limit: 10, totalPages: 0 }
    const { page, limit } = state.templates
    return await getTemplates(tenantId, page, limit)
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to load templates')
  }
})
