import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/auth.slice'
import cstarReducer from './slices/cstar.slice'
import loadingReducer from './slices/loading.slice'
import toastReducer from './slices/toast.slice'
import notificationReducer from './slices/notification.slice'
import codeTablesReducer from './slices/codeTables.slice'
import userReducer from './slices/user.slice'
import tenantReducer from './slices/tenant.slice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    user: userReducer,
    cstar: cstarReducer,
    loading: loadingReducer,
    toast: toastReducer,
    notification: notificationReducer,
    codeTables: codeTablesReducer,
    tenant: tenantReducer,
  },
})

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
