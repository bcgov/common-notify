import { FC } from 'react'
import { useAppSelector } from '@/redux/hooks'
import '@/scss/components/loading-spinner.scss'

/**
 * Global loading spinner that shows when API requests exceed 0.5 seconds
 * Only displays if isLoading is true in Redux
 */
export const LoadingSpinner: FC = () => {
  const isLoading = useAppSelector((state) => state.loading.isLoading)

  if (!isLoading) {
    return null
  }

  return (
    <div className="loading-spinner-overlay">
      <div className="loading-spinner">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    </div>
  )
}

export default LoadingSpinner
