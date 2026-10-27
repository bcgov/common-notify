import { describe, it, expect } from 'vitest'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import {
  CallbackRegistrationRequest,
  CallbackRegistrationUpdateRequest,
} from './callback-registration.dto'

const registration = (headers: unknown) => ({
  url: 'https://tenant.example/hook',
  channelType: ['email'],
  trigger: ['success'],
  headers,
})

const headerErrors = async (body: object, dto: new () => object = CallbackRegistrationRequest) => {
  const errors = await validate(plainToInstance(dto, body))
  return errors.filter((e) => e.property === 'headers')
}

describe('callback headers', () => {
  it.each([
    'Host',
    'cookie',
    'Forwarded',
    'X-Forwarded-For',
    'x-forwarded-host',
    'X-Real-IP',
    'Proxy-Authorization',
    'Transfer-Encoding',
    'Content-Length',
    'Connection',
    'X-Webhook-Signature',
  ])('rejects %s', async (name) => {
    const [error] = await headerErrors(registration({ [name]: 'value' }))

    expect(Object.values(error.constraints ?? {}).join()).toContain(name)
  })

  it('accepts Authorization and ordinary custom headers', async () => {
    expect(
      await headerErrors(registration({ Authorization: 'Bearer t', 'X-Environment': 'prod' })),
    ).toEqual([])
  })

  it('rejects a non-string value', async () => {
    expect(await headerErrors(registration({ 'X-Retry': 3 }))).toHaveLength(1)
  })

  it('applies to updates as well', async () => {
    expect(
      await headerErrors({ headers: { Host: 'x' } }, CallbackRegistrationUpdateRequest),
    ).toHaveLength(1)
  })
})
