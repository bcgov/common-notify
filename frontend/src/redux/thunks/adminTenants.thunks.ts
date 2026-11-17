import { createAsyncThunk } from '@reduxjs/toolkit'
import adminApi from '@/api/admin.api'
import { getAdminUsageTenants } from '@/api/apiKeyUsage.api'
import type { AdminTenantOption } from '@/api/apiKeyUsage.api'

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

/**
 * Tenants with Notify connected, by name: what the admin tenant searches suggest. Unlike
 * fetchAllNotifyTenants, leaves out deleted tenants and rows that never came from CSTAR.
 */
export const fetchNotifyTenantOptions = createAsyncThunk<
  AdminTenantOption[],
  void,
  { state: { adminTenants: { notifyOptionsRequested: boolean } }; rejectValue: string }
>(
  'adminTenants/fetchNotifyOptions',
  async (_, { rejectWithValue }) => {
    try {
      return await getAdminUsageTenants()
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch tenants')
    }
  },
  // Once per session: skipped while a fetch is in flight or has succeeded.
  { condition: (_, { getState }) => !getState().adminTenants.notifyOptionsRequested },
)
