import type { TypedUseSelectorHook } from 'react-redux'
import { useDispatch, useSelector, useStore } from 'react-redux'
import type { RootState, AppDispatch, AppStore } from './store'

/**
 * Use throughout your app instead of plain `useDispatch`.
 * This is type-safe and will auto-complete action types
 */
export const useAppDispatch = () => useDispatch<AppDispatch>()

/**
 * Use throughout your app instead of plain `useSelector`.
 * This is type-safe and will auto-complete available state
 */
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector

/**
 * Use throughout your app instead of plain `useStore`. Only for reading state at the moment
 * of an event (e.g. after an awaited dispatch); render from `useAppSelector`.
 */
export const useAppStore = useStore.withTypes<AppStore>()
