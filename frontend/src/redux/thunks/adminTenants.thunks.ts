import { createAsyncThunk } from '@reduxjs/toolkit'
import adminApi from '@/api/admin.api'

export const fetchAllNotifyTenants = createAsyncThunk<
  Array<{
    id: string
    name: string
  }>,
  void,
  {
    rejectValue: string
  }
>('adminTenants/fetchAll', async (_, { rejectWithValue }) => {
  try {
    const response = await adminApi.getAllTenants()
    return response
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch tenants')
  }
})
