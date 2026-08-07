import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSettings, updateSmsSettings, updateTenantSettings } from './settings.api'
import { generateApiParameters, get, patch } from '@/common/api'

vi.mock('@/common/api', () => ({
  get: vi.fn(),
  patch: vi.fn(),
  generateApiParameters: vi.fn((url: string, params?: unknown) => ({
    url,
    params,
    requiresAuthentication: true,
  })),
  STATUS_CODES: {
    Unauthorized: 401,
    Forbidden: 403,
  },
}))

const BASE_URL = '/api/v1/frontend/tenant-settings'

describe('settings.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads every tab from one suffix-less route', async () => {
    vi.mocked(get).mockResolvedValue({ alertEmail: 'alerts@example.com' })

    await getSettings()

    expect(get).toHaveBeenCalledWith(expect.objectContaining({ url: BASE_URL }))
  })

  it('returns null when no settings row exists yet', async () => {
    vi.mocked(get).mockResolvedValue(null)

    await expect(getSettings()).resolves.toBeNull()
  })

  it('sends the tenant payload as the PATCH body on the per-tab route', async () => {
    vi.mocked(patch).mockResolvedValue({})
    const data = { alertEmail: 'alerts@example.com', defaultSenderEmail: 'noreply' }

    await updateTenantSettings(data)

    // `patch` maps `params` to the request body, not the query string.
    expect(patch).toHaveBeenCalledWith(
      expect.objectContaining({ url: `${BASE_URL}/tenant`, params: data }),
    )
  })

  it('sends the SMS payload as the PATCH body on the per-tab route', async () => {
    vi.mocked(patch).mockResolvedValue({})
    const data = {
      smsNotificationsEnabled: false,
      includeTenantNameInSms: true,
      internationalSmsEnabled: false,
    }

    await updateSmsSettings(data)

    expect(patch).toHaveBeenCalledWith(
      expect.objectContaining({ url: `${BASE_URL}/sms`, params: data }),
    )
  })

  /*
   * generateApiParameters is what defaults requiresAuthentication to true, which is the
   * only thing making get/patch refresh the auth token via setAuthHeader(). Building the
   * request from a bare { url } literal silently skips that, so pin it here.
   */
  it.each([
    ['getSettings', () => getSettings()],
    [
      'updateTenantSettings',
      () => updateTenantSettings({ alertEmail: null, defaultSenderEmail: 'noreply' }),
    ],
    [
      'updateSmsSettings',
      () =>
        updateSmsSettings({
          smsNotificationsEnabled: true,
          includeTenantNameInSms: true,
          internationalSmsEnabled: false,
        }),
    ],
  ])('builds the %s request through generateApiParameters so it is authenticated', async (
    _name,
    call,
  ) => {
    vi.mocked(get).mockResolvedValue({})
    vi.mocked(patch).mockResolvedValue({})

    await call()

    expect(generateApiParameters).toHaveBeenCalledTimes(1)
    const built = vi.mocked(generateApiParameters).mock.results[0].value
    expect(built.requiresAuthentication).toBe(true)
  })

  it('surfaces a readable message when the user lacks permission', async () => {
    vi.mocked(patch).mockRejectedValue({ response: { status: 403 } })

    await expect(
      updateTenantSettings({ alertEmail: null, defaultSenderEmail: 'noreply' }),
    ).rejects.toThrow('You do not have permission to modify the tenant settings')
  })

  it('surfaces a readable message when the read is unauthorized', async () => {
    vi.mocked(get).mockRejectedValue({ response: { status: 401 } })

    await expect(getSettings()).rejects.toThrow('You are not authorized to view settings')
  })

  it('falls back to the server message for other failures', async () => {
    vi.mocked(get).mockRejectedValue({
      response: { status: 500, data: { message: 'Database unavailable' } },
    })

    await expect(getSettings()).rejects.toThrow('Failed to load settings: Database unavailable')
  })
})
