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
    const tenantId = state.tenant.selectedTenant?.id
    if (!tenantId) return []
    const response = await getTemplates(tenantId)
    return Array.isArray(response) ? response : ((response as any).templates ?? [])
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to load templates')
  }
})
