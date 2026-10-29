import { describe, it, expect } from 'vitest'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { createCipheriv, randomBytes } from 'crypto'
import {
  CALLBACK_SECRET_MAX_BYTES,
  CALLBACK_URL_MAX_LENGTH,
  CallbackRegistrationRequest,
  CallbackRegistrationUpdateRequest,
} from './callback-registration.dto'

const registration = (overrides: object) => ({
  url: 'https://tenant.example/hook',
  channelType: ['email'],
  trigger: ['success'],
  ...overrides,
})

const errorsOn = async (
  property: string,
  body: object,
  dto: new () => object = CallbackRegistrationRequest,
) => (await validate(plainToInstance(dto, body))).filter((e) => e.property === property)

// The same layout EncryptionService stores: base64(IV + auth tag + ciphertext).
const storedLength = (secret: string) => {
  const cipher = createCipheriv('aes-256-gcm', randomBytes(32), randomBytes(12))
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return Buffer.concat([randomBytes(12), cipher.getAuthTag(), encrypted]).toString('base64').length
}

describe('CallbackRegistrationRequest limits', () => {
  // A ~1,300-character JWT used to get past validation and 500 on the VARCHAR(512) insert.
  it('rejects a secret too long for the column, as a 400 rather than a database error', async () => {
    const [error] = await errorsOn('secret', registration({ secret: 'x'.repeat(1300) }))

    expect(error.constraints).toEqual({
      isByteLength: `secret must be at most ${CALLBACK_SECRET_MAX_BYTES} bytes`,
    })
  })

  it('accepts the longest secret that still fits the column once encrypted', async () => {
    const secret = 'x'.repeat(CALLBACK_SECRET_MAX_BYTES)

    expect(await errorsOn('secret', registration({ secret }))).toEqual([])
    expect(storedLength(secret)).toBeLessThanOrEqual(512)
  })

  // Characters are not the limit: three-byte characters fill the column three times as fast.
  it('measures the secret in bytes, not characters', async () => {
    const secret = '€'.repeat(CALLBACK_SECRET_MAX_BYTES / 2)

    expect(await errorsOn('secret', registration({ secret }))).toHaveLength(1)
  })

  it('rejects a URL longer than the column', async () => {
    const url = `https://tenant.example/${'a'.repeat(CALLBACK_URL_MAX_LENGTH)}`

    expect(await errorsOn('url', registration({ url }))).toHaveLength(1)
  })

  it('applies the limits to updates as well', async () => {
    const body = { secret: 'x'.repeat(1300) }

    expect(await errorsOn('secret', body, CallbackRegistrationUpdateRequest)).toHaveLength(1)
  })
})
