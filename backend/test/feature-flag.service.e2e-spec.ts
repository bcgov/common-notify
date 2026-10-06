import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { FeatureFlagService } from '../src/api/feature-flag/feature-flag.service'
import { FeatureFlag } from '../src/api/feature-flag/entities/feature-flag.entity'
import { FeatureFlagCode } from '../src/api/feature-flag/entities/feature-flag-code.entity'
import { Tenant } from '../src/api/admin/tenants/entities/tenant.entity'
import { TenantStatusCode } from '../src/api/admin/tenants/entities/tenant-status-code.entity'

/**
 * Feature flag resolution against a real Postgres.
 *
 * The unit spec mocks the repository, so it asserts the shape of the call and never generates
 * SQL. That is how the TypeORM 1.0 upgrade shipped a global-flag lookup the database rejects:
 * `where: { tenantId: null }` throws, `isEnabled` catches it and returns its "disabled" default,
 * and every flag-guarded route answers 403. These cases run the query, so a lookup the driver
 * refuses fails here instead of in a deployed environment.
 *
 * Needs Postgres (localhost:5432, user postgres, password default; override POSTGRES_PORT).
 * Builds its own database so a developer's migrated dev schema is never synchronized over.
 */
const PORT = Number(process.env.POSTGRES_PORT ?? 5432)
const TEST_DB = 'notify_feature_flag_e2e'
const base = {
  type: 'postgres' as const,
  host: 'localhost',
  port: PORT,
  username: 'postgres',
  password: 'default',
}

const TENANT_ID = '7f1d5c9e-0000-4000-8000-000000000001'
const OTHER_TENANT_ID = '7f1d5c9e-0000-4000-8000-000000000002'

describe('FeatureFlagService (database)', () => {
  let dataSource: DataSource
  let service: FeatureFlagService

  const dropAndCreate = async (sql: string[]) => {
    const admin = new DataSource({ ...base, database: 'postgres' })
    await admin.initialize()
    for (const statement of sql) await admin.query(statement)
    await admin.destroy()
  }

  beforeAll(async () => {
    await dropAndCreate([`DROP DATABASE IF EXISTS ${TEST_DB}`, `CREATE DATABASE ${TEST_DB}`])

    dataSource = new DataSource({
      ...base,
      database: TEST_DB,
      entities: [FeatureFlag, FeatureFlagCode, Tenant, TenantStatusCode],
      synchronize: false,
    })
    await dataSource.initialize()
    await dataSource.query('CREATE SCHEMA IF NOT EXISTS notify')
    await dataSource.synchronize()

    const now = new Date()
    await dataSource.getRepository(TenantStatusCode).save({ code: 'active', description: 'Active' })
    await dataSource.getRepository(Tenant).save([
      { id: TENANT_ID, name: 'Tenant A', slug: 'tenant-a', createdAt: now, updatedAt: now },
      { id: OTHER_TENANT_ID, name: 'Tenant B', slug: 'tenant-b', createdAt: now, updatedAt: now },
    ])
    await dataSource.getRepository(FeatureFlagCode).save(
      ['global_on', 'global_off', 'overridden_off', 'no_rows'].map((code) => ({
        code,
        displayName: code,
        description: code,
      })),
    )
    await dataSource.getRepository(FeatureFlag).save([
      { code: 'global_on', enabled: true, tenantId: null },
      { code: 'global_off', enabled: false, tenantId: null },
      { code: 'overridden_off', enabled: true, tenantId: null },
      { code: 'overridden_off', enabled: false, tenantId: TENANT_ID },
      { code: 'global_off', enabled: true, tenantId: OTHER_TENANT_ID },
    ])

    service = new FeatureFlagService(dataSource.getRepository(FeatureFlag))
  }, 120_000)

  afterAll(async () => {
    await dataSource?.destroy()
    await dropAndCreate([`DROP DATABASE IF EXISTS ${TEST_DB}`])
  }, 120_000)

  describe('isEnabled', () => {
    it('falls back to an enabled global flag when the tenant has no override', async () => {
      await expect(service.isEnabled('global_on', TENANT_ID)).resolves.toBe(true)
    })

    it('falls back to a disabled global flag when the tenant has no override', async () => {
      await expect(service.isEnabled('global_off', TENANT_ID)).resolves.toBe(false)
    })

    it("lets a tenant's override win over the global flag", async () => {
      await expect(service.isEnabled('overridden_off', TENANT_ID)).resolves.toBe(false)
      await expect(service.isEnabled('overridden_off', OTHER_TENANT_ID)).resolves.toBe(true)
      await expect(service.isEnabled('global_off', OTHER_TENANT_ID)).resolves.toBe(true)
    })

    it('reads the global flag when no tenant is given', async () => {
      await expect(service.isEnabled('global_on')).resolves.toBe(true)
      await expect(service.isEnabled('global_off')).resolves.toBe(false)
    })

    it('returns false for a code with no flag rows', async () => {
      await expect(service.isEnabled('no_rows', TENANT_ID)).resolves.toBe(false)
    })
  })

  describe('getFlagsForTenant', () => {
    it('answers the same as isEnabled for every code', async () => {
      const flags = await service.getFlagsForTenant(TENANT_ID)

      expect(flags).toMatchObject({ global_on: true, global_off: false, overridden_off: false })
      for (const [code, enabled] of Object.entries(flags)) {
        await expect(service.isEnabled(code, TENANT_ID)).resolves.toBe(enabled)
      }
    })
  })

  describe('getByCodeAndTenant', () => {
    it('finds the global row when no tenant is given', async () => {
      const flag = await service.getByCodeAndTenant('global_on')

      expect(flag?.tenantId).toBeNull()
      expect(flag?.enabled).toBe(true)
    })

    it('finds the tenant row when a tenant is given', async () => {
      const flag = await service.getByCodeAndTenant('overridden_off', TENANT_ID)

      expect(flag?.tenantId).toBe(TENANT_ID)
      expect(flag?.enabled).toBe(false)
    })
  })
})
