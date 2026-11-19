import { describe, expect, it } from 'vitest'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { FeatureFlagHistoryQueryDto } from './feature-flag-history-query.dto'

// What the global ValidationPipe does with a query string: transform, then validate.
const parse = async (query: Record<string, string>) => {
  const dto = plainToInstance(FeatureFlagHistoryQueryDto, query)
  return { dto, errors: await validate(dto, { whitelist: true, forbidNonWhitelisted: true }) }
}

describe('FeatureFlagHistoryQueryDto', () => {
  it('defaults to the first page of 10', async () => {
    const { dto, errors } = await parse({})

    expect(errors).toHaveLength(0)
    expect(dto).toMatchObject({ page: 1, limit: 10 })
  })

  it('converts page and limit from the query string', async () => {
    const { dto, errors } = await parse({ page: '3', limit: '25' })

    expect(errors).toHaveLength(0)
    expect(dto).toMatchObject({ page: 3, limit: 25 })
  })

  it('rejects a limit over 100', async () => {
    const { errors } = await parse({ limit: '101' })

    expect(errors.map((e) => e.property)).toEqual(['limit'])
  })

  it('rejects a page below 1', async () => {
    const { errors } = await parse({ page: '0' })

    expect(errors.map((e) => e.property)).toEqual(['page'])
  })

  it('rejects list parameters this endpoint does not take', async () => {
    const { errors } = await parse({ sort: 'createdAt' })

    expect(errors.map((e) => e.property)).toEqual(['sort'])
  })
})
