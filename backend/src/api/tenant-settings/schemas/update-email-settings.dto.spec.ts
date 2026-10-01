import { validate } from 'class-validator'
import { UpdateEmailSettingsDto } from './update-email-settings.dto'

describe('UpdateEmailSettingsDto', () => {
  const validValues = {
    emailLogoId: '11111111-1111-4111-8111-111111111111',
    emailNotificationsEnabled: true,
    replyToEmail: null,
    emailAttachmentsEnabled: true,
  }

  it('accepts a UUID emailLogoId', async () => {
    const errors = await validate(Object.assign(new UpdateEmailSettingsDto(), validValues))

    expect(errors).toHaveLength(0)
  })

  it('accepts null to use the default logo', async () => {
    const errors = await validate(
      Object.assign(new UpdateEmailSettingsDto(), { ...validValues, emailLogoId: null }),
    )

    expect(errors).toHaveLength(0)
  })

  it('rejects a non-UUID emailLogoId', async () => {
    const errors = await validate(
      Object.assign(new UpdateEmailSettingsDto(), { ...validValues, emailLogoId: 'not-a-uuid' }),
    )

    expect(errors.some((error) => error.property === 'emailLogoId')).toBe(true)
  })

  it.each([true, false])('accepts header mode %s without a client-supplied title', async (mode) => {
    const errors = await validate(
      Object.assign(new UpdateEmailSettingsDto(), {
        ...validValues,
        useCustomEmailHeader: mode,
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    )

    expect(errors).toHaveLength(0)
  })

  it('rejects a non-boolean header mode', async () => {
    const errors = await validate(
      Object.assign(new UpdateEmailSettingsDto(), {
        ...validValues,
        useCustomEmailHeader: 'true',
      }),
    )

    expect(errors.some((error) => error.property === 'useCustomEmailHeader')).toBe(true)
  })
})
