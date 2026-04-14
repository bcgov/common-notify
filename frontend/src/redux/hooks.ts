import type { TypedUseSelectorHook } from 'react-redux'
import { useDispatch, useSelector } from 'react-redux'
import type { RootState, AppDispatch } from './store'

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
