import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/auth.slice'
import userReducer from './slices/user.slice'
import usersReducer from './slices/users.slice'
import cstarReducer from './slices/cstar.slice'
import loadingReducer from './slices/loading.slice'
import toastReducer from './slices/toast.slice'
import notificationReducer from './slices/notification.slice'
import codeTablesReducer from './slices/codeTables.slice'
import tenantReducer from './slices/tenant.slice'
import templatesReducer from './slices/templates.slice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    user: userReducer,
    users: usersReducer,
    cstar: cstarReducer,
    loading: loadingReducer,
    toast: toastReducer,
    notification: notificationReducer,
    codeTables: codeTablesReducer,
    tenant: tenantReducer,
    templates: templatesReducer,
  },
})

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
