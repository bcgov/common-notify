import {
  decrementRequest,
  hideLoading,
  incrementRequest,
  showLoading,
} from '@/redux/slices/loading.slice'
import type { AppDispatch } from '@/redux/store'

/**
 * Drives the app-wide loading overlay from in-flight API requests.
 *
 * `common/api.ts` cannot import the store directly - the store pulls in slices, which pull in
 * thunks, which pull in the API modules - so the store registers itself here at start-up instead
 * and the axios interceptors call through this module.
 */

/**
 * How long a request may run before the overlay appears.
 *
 * Most calls finish well inside this, so the common case is no flicker at all; only a request slow
 * enough to be worth explaining gets an overlay.
 */
const SHOW_DELAY_MS = 500

let dispatch: AppDispatch | null = null
let getRequestCount: (() => number) | null = null
let timer: ReturnType<typeof setTimeout> | null = null

/** Wire the tracker to the store. Called once at start-up. */
export function initGlobalLoading(
  storeDispatch: AppDispatch,
  requestCountSelector: () => number,
): void {
  dispatch = storeDispatch
  getRequestCount = requestCountSelector
}

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

/** A request has started. */
export function trackRequestStart(): void {
  if (!dispatch) return

  dispatch(incrementRequest())

  // One timer for the whole burst: a second request starting does not restart the countdown, so a
  // page that fires five calls at once still shows the overlay 500ms after the first.
  if (timer === null) {
    timer = setTimeout(() => {
      timer = null
      if ((getRequestCount?.() ?? 0) > 0) {
        dispatch?.(showLoading())
      }
    }, SHOW_DELAY_MS)
  }
}

/** A request has finished, whether it succeeded or failed. */
export function trackRequestEnd(): void {
  if (!dispatch) return

  dispatch(decrementRequest())

  if ((getRequestCount?.() ?? 0) === 0) {
    clearTimer()
    dispatch(hideLoading())
  }
}

/** Test seam: forget the registered store and cancel any pending timer. */
export function resetGlobalLoading(): void {
  clearTimer()
  dispatch = null
  getRequestCount = null
}
