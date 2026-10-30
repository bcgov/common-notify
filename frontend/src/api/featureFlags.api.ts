import type { AxiosError } from 'axios'
import { get, generateApiParameters } from '@/common/api'
import type { FeatureFlagHistoryEntry } from '@/interfaces/feature-flag.interface'

/**
 * Feature Flag admin API, for one-shot reads nothing else in the store needs.
 * The flag list and its mutations live in featureFlags.thunks.ts.
 */

const BASE_URL = '/api/v1/frontend/admin/feature-flags'

/** Who changed a flag and when, newest first. Requires NOTIFY_ADMIN. */
export async function getFeatureFlagHistory(id: string): Promise<FeatureFlagHistoryEntry[]> {
  try {
    const params = generateApiParameters(`${BASE_URL}/${encodeURIComponent(id)}/history`)
    return await get<FeatureFlagHistoryEntry[]>(params)
  } catch (error) {
    const message = (error as AxiosError<{ message?: string }>).response?.data?.message
    throw new Error(
      `Failed to load feature flag history: ${message || (error instanceof Error ? error.message : 'Unknown error')}`,
    )
  }
}
