import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/auth.slice'
import loadingReducer from './slices/loading.slice'
import toastReducer from './slices/toast.slice'
import notificationReducer from './slices/notification.slice'
import codeTablesReducer from './slices/codeTables.slice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    loading: loadingReducer,
    toast: toastReducer,
    notification: notificationReducer,
    codeTables: codeTablesReducer,
  },
})

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
