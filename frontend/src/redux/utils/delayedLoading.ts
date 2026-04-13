export interface DelayedLoadingOptions {
  delay?: number
}

/**
 * Helper to manage delayed loading spinner with configurable delay
 * Shows loading after specified delay to avoid spinner for fast requests (default: 0.5s)
 */
export const delayedLoading = (options?: DelayedLoadingOptions) => {
  const delay = options?.delay ?? 500
  return { delay }
}
