import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import loadingReducer from '@/redux/slices/loading.slice'
import {
  initGlobalLoading,
  resetGlobalLoading,
  trackRequestEnd,
  trackRequestStart,
} from './globalLoading'

function makeStore() {
  const store = configureStore({ reducer: { loading: loadingReducer } })
  initGlobalLoading(store.dispatch, () => store.getState().loading.requestCount)
  return store
}

describe('globalLoading', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    resetGlobalLoading()
    vi.useRealTimers()
  })

  it('does not show the overlay for a request that finishes quickly', () => {
    const store = makeStore()

    trackRequestStart()
    vi.advanceTimersByTime(400)
    trackRequestEnd()
    vi.advanceTimersByTime(1000)

    expect(store.getState().loading.isLoading).toBe(false)
  })

  it('shows the overlay once a request outlives the delay', () => {
    const store = makeStore()

    trackRequestStart()
    vi.advanceTimersByTime(500)

    expect(store.getState().loading.isLoading).toBe(true)
  })

  it('hides the overlay when the last request finishes', () => {
    const store = makeStore()

    trackRequestStart()
    vi.advanceTimersByTime(500)
    trackRequestEnd()

    expect(store.getState().loading.isLoading).toBe(false)
    expect(store.getState().loading.requestCount).toBe(0)
  })

  it('keeps the overlay up while other requests are still in flight', () => {
    const store = makeStore()

    trackRequestStart()
    trackRequestStart()
    vi.advanceTimersByTime(500)
    trackRequestEnd()

    expect(store.getState().loading.requestCount).toBe(1)
    expect(store.getState().loading.isLoading).toBe(true)
  })

  it('measures the delay from the first request of a burst, not the last', () => {
    const store = makeStore()

    trackRequestStart()
    vi.advanceTimersByTime(300)
    trackRequestStart()
    vi.advanceTimersByTime(200)

    expect(store.getState().loading.isLoading).toBe(true)
  })

  it('cancels a pending overlay when every request finishes first', () => {
    const store = makeStore()

    trackRequestStart()
    trackRequestStart()
    vi.advanceTimersByTime(100)
    trackRequestEnd()
    trackRequestEnd()
    vi.advanceTimersByTime(5000)

    expect(store.getState().loading.isLoading).toBe(false)
  })

  it('never drives the counter below zero on an unmatched completion', () => {
    const store = makeStore()

    trackRequestEnd()

    expect(store.getState().loading.requestCount).toBe(0)
  })

  it('does nothing until a store has been registered', () => {
    resetGlobalLoading()

    expect(() => {
      trackRequestStart()
      trackRequestEnd()
    }).not.toThrow()
  })
})
