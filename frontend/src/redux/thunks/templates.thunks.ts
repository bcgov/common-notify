import { createAsyncThunk } from '@reduxjs/toolkit'
import { getTemplates } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import type { RootState } from '../store'

export const fetchTemplates = createAsyncThunk<
  TemplateResponse[],
  void,
  { state: RootState; rejectValue: string }
>('templates/fetchAll', async (_, { getState, rejectWithValue }) => {
  try {
    const state = getState()
    const selectedTenant = state.tenant.selectedTenant
    const tenantId = selectedTenant?.id

    if (!tenantId) {
      return rejectWithValue('No tenant selected')
    }

    const response = await getTemplates(tenantId, 1, 10)
    // Handle both array and paginated response formats
    return Array.isArray(response) ? response : response.templates || []
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to load templates')
  }
})
