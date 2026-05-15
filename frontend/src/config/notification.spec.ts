import { afterEach, describe, expect, it, vi } from 'vitest'

const loadMaxResultsPerPage = async (value?: string) => {
  vi.resetModules()
  vi.doMock('@/config', () => ({
    default: {
      MAX_NOTIFICATION_RESULTS_PER_PAGE: value ?? '',
    },
  }))

  const module = await import('./notification')
  return module.MAX_NOTIFICATION_RESULTS_PER_PAGE
}

describe('notification config', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unmock('@/config')
  })

  it('uses the configured positive integer value', async () => {
    await expect(loadMaxResultsPerPage('25')).resolves.toBe(25)
  })

  it('falls back to 10 when the value is missing or empty', async () => {
    await expect(loadMaxResultsPerPage(undefined)).resolves.toBe(10)
    await expect(loadMaxResultsPerPage('')).resolves.toBe(10)
  })

  it('falls back to 10 for non-numeric, zero, negative, or decimal values', async () => {
    await expect(loadMaxResultsPerPage('abc')).resolves.toBe(10)
    await expect(loadMaxResultsPerPage('0')).resolves.toBe(10)
    await expect(loadMaxResultsPerPage('-5')).resolves.toBe(10)
    await expect(loadMaxResultsPerPage('10.5')).resolves.toBe(10)
  })
})
