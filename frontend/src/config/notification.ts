import config from '@/config'

const DEFAULT_RESULTS_PER_PAGE = 10

const parseResultsPerPage = (value?: string) => {
  const normalized = value?.trim() ?? ''
  if (!/^\d+$/.test(normalized)) {
    return DEFAULT_RESULTS_PER_PAGE
  }

  const parsed = Number(normalized)
  return parsed > 0 ? parsed : DEFAULT_RESULTS_PER_PAGE
}

export const MAX_NOTIFICATION_RESULTS_PER_PAGE = parseResultsPerPage(
  config.MAX_NOTIFICATION_RESULTS_PER_PAGE,
)
