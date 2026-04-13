/**
 * Helper to manage delayed loading spinner
 * Shows loading after 0.5 seconds to avoid spinner for fast requests
 */
export const createDelayedLoadingManager = (dispatch: any) => {
  let timeoutId: NodeJS.Timeout | null = null

  const startLoading = () => {
    // Dispatch action to track request
    const { incrementRequest, showLoading } = require('../slices/loading.slice')
    dispatch(incrementRequest())

    // Show spinner after 0.5s
    timeoutId = setTimeout(() => {
      dispatch(showLoading())
    }, 500)
  }

  const stopLoading = () => {
    // Clear timeout if request completes fast
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }

    // Decrement request and hide loading
    const { decrementRequest, hideLoading } = require('../slices/loading.slice')
    dispatch(decrementRequest())
    dispatch(hideLoading())
  }

  return { startLoading, stopLoading }
}
