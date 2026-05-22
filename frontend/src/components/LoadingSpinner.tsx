import type { FC } from 'react'
import { useAppSelector } from '@/redux/hooks'
import '@/scss/components/loading-spinner.scss'

type Props = {
  isVisible?: boolean
}

export const LoadingSpinner: FC<Props> = ({ isVisible }) => {
  const globalLoading = useAppSelector((state) => state.loading.isLoading)
  const shouldRender = isVisible ?? globalLoading

  if (!shouldRender) {
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
