import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { AdminNotificationsService } from '../src/api/admin/notifications/admin-notifications.service'
import { NotificationRequest } from '../src/api/notification/entities/notification-request.entity'
import { NotificationRequestDetail } from '../src/api/notification/entities/notification-request-detail.entity'
import { NotificationStatusCode } from '../src/api/notification/entities/notification-status-code.entity'
import { Tenant } from '../src/api/admin/tenants/entities/tenant.entity'
import { TenantStatusCode } from '../src/api/admin/tenants/entities/tenant-status-code.entity'

/**
 * The admin notifications queries against a real Postgres. The unit spec fakes the query
 * builder, so it can't tell whether the paged join, the jsonb channel filter or the raw count and
 * history queries are SQL the database accepts.
 *
 * Needs Postgres (localhost:5432, user postgres, password default; override POSTGRES_PORT).
 * Builds its own database so a developer's migrated dev schema is never synchronized over.
 */
const PORT = Number(process.env.POSTGRES_PORT ?? 5432)
const TEST_DB = 'notify_admin_notifications_e2e'
const base = {
  type: 'postgres' as const,
  host: 'localhost',
  port: PORT,
  username: 'postgres',
  password: 'default',
}

const PARKS = '7f1d5c9e-0000-4000-8000-0000000000a1'
const ROADS = '7f1d5c9e-0000-4000-8000-0000000000a2'
const FAILED_EMAIL = '7f1d5c9e-0000-4000-8000-0000000000b1'
const QUEUED_SMS = '7f1d5c9e-0000-4000-8000-0000000000b2'
const INTERNAL = '7f1d5c9e-0000-4000-8000-0000000000b3'
const OLD = '7f1d5c9e-0000-4000-8000-0000000000b4'

describe('AdminNotificationsService (database)', () => {
  let dataSource: DataSource
  let service: AdminNotificationsService

  const dropAndCreate = async (sql: string[]) => {
    const admin = new DataSource({ ...base, database: 'postgres' })
    await admin.initialize()
    for (const statement of sql) await admin.query(statement)
    await admin.destroy()
  }

  beforeAll(async () => {
    await dropAndCreate([`DROP DATABASE IF EXISTS ${TEST_DB}`, `CREATE DATABASE ${TEST_DB}`])
    const bootstrap = new DataSource({ ...base, database: TEST_DB })
    await bootstrap.initialize()
    await bootstrap.query('CREATE SCHEMA notify')
    await bootstrap.destroy()

    dataSource = new DataSource({
      ...base,
      database: TEST_DB,
      schema: 'notify',
      entities: [
        NotificationRequest,
        NotificationRequestDetail,
        NotificationStatusCode,
        Tenant,
        TenantStatusCode,
      ],
      synchronize: true,
    })
    await dataSource.initialize()
    // No entity: in the real schema the audit_history() trigger fills it (V29).
    await dataSource.query(`
      CREATE TABLE notify.notification_request_history (
        h_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        target_row_id uuid NOT NULL,
        operation_type char(1) NOT NULL,
        operation_executed_at timestamptz DEFAULT now() NOT NULL,
        data_after_operation jsonb NOT NULL
      )`)

    await dataSource.query(`
      INSERT INTO notify.tenant_status_code (code, description, created_at, updated_at, sort_order)
      VALUES ('active', 'Active', now(), now(), 1)`)
    await dataSource.query(
      `INSERT INTO notify.tenant (id, name, slug, status, created_at, updated_at, is_deleted)
       VALUES ($1, 'Parks Booking', 'parks', 'active', now(), now(), false),
              ($2, 'Roads', 'roads', 'active', now(), now(), false)`,
      [PARKS, ROADS],
    )
    await dataSource.query(`
      INSERT INTO notify.notification_status_code (code, description, display_name, sort_order)
      VALUES ('failed', 'Failed', 'Failed', 1), ('queued', 'Queued', 'Queued', 2)`)
    await dataSource.query(
      `INSERT INTO notify.notification_request
         (id, tenant_id, status, channel_codes, request_route, recipients, payload, is_internal,
          error_reason, created_at, updated_at)
       VALUES
         ($1, $5, 'failed', '["EMAIL"]', 'notifysimple',
          '{"email":["jane@gov.bc.ca","sam@gov.bc.ca"]}', '{"body":"secret"}', false,
          'CHES rejected jane@gov.bc.ca', '2026-11-10T10:00:00Z', '2026-11-10T10:05:00Z'),
         ($2, $6, 'queued', '["SMS"]', 'notifyevent', '{"sms":["+12505550123"]}', null, false,
          null, '2026-11-10T11:00:00Z', '2026-11-10T11:00:00Z'),
         ($3, $5, 'queued', '["EMAIL"]', 'internal', '{"email":["ops@gov.bc.ca"]}', null, true,
          null, '2026-11-10T12:00:00Z', '2026-11-10T12:00:00Z'),
         ($4, $5, 'failed', '["EMAIL"]', 'notifysimple', '{"email":["a@b.ca"]}', null, false,
          null, '2026-10-01T10:00:00Z', '2026-10-01T10:00:00Z')`,
      [FAILED_EMAIL, QUEUED_SMS, INTERNAL, OLD, PARKS, ROADS],
    )
    await dataSource.query(
      `INSERT INTO notify.notification_request_detail
         (notification_request_id, recipient_address, channel, status, error_message,
          provider_response, attempt_count, last_attempt_at, created_at, updated_at)
       VALUES
         ($1, 'jane@gov.bc.ca', 'EMAIL', 'failed', '550 jane@gov.bc.ca unknown',
          '{"to":"jane@gov.bc.ca"}', 3, '2026-11-10T10:04:00Z', now(), now()),
         ($1, 'sam@gov.bc.ca', 'EMAIL', 'sent', null, '"tx-1"', 1, '2026-11-10T10:01:00Z',
          now(), now())`,
      [FAILED_EMAIL],
    )
    await dataSource.query(
      `INSERT INTO notify.notification_request_history
         (target_row_id, operation_type, operation_executed_at, data_after_operation)
       VALUES ($1, 'I', '2026-11-10T10:00:00Z', '{"status":"queued"}'),
              ($1, 'U', '2026-11-10T10:00:01Z', '{"status":"queued"}'),
              ($1, 'U', '2026-11-10T10:00:02Z', '{"status":"processing"}'),
              ($1, 'U', '2026-11-10T10:05:00Z', '{"status":"failed"}')`,
      [FAILED_EMAIL],
    )

    service = new AdminNotificationsService(
      dataSource.getRepository(NotificationRequest),
      dataSource.getRepository(NotificationRequestDetail),
    )
  }, 120_000)

  afterAll(async () => {
    await dataSource?.destroy()
    await dropAndCreate([`DROP DATABASE IF EXISTS ${TEST_DB}`])
  }, 120_000)

  const november = [
    'createdAt:gte:2026-11-01T00:00:00.000Z',
    'createdAt:lte:2026-11-30T23:59:59.999Z',
  ]

  it('lists requests in the range across tenants, newest first, leaving out internal ones', async () => {
    const result = await service.list({ page: 1, limit: 15, filter: november })

    expect(result.data.map((row) => row.id)).toEqual([QUEUED_SMS, FAILED_EMAIL])
    expect(result.count).toBe(2)
    expect(result.data[1]).toMatchObject({
      tenantName: 'Parks Booking',
      status: { code: 'failed', displayName: 'Failed' },
      recipientCount: 2,
      failedCount: 1,
    })
    // No deliveries yet: counted from the addresses on the request.
    expect(result.data[0]).toMatchObject({ tenantName: 'Roads', recipientCount: 1, failedCount: 0 })
  })

  it('filters by tenant name, channel and status, and pages', async () => {
    const byTenant = await service.list({ page: 1, limit: 15, filter: november }, 'park')
    expect(byTenant.data.map((row) => row.id)).toEqual([FAILED_EMAIL])

    const bySms = await service.list({
      page: 1,
      limit: 15,
      filter: [...november, 'channel:in:SMS'],
    })
    expect(bySms.data.map((row) => row.id)).toEqual([QUEUED_SMS])

    const byStatus = await service.list({ page: 1, limit: 15, filter: ['status:in:failed'] })
    expect(byStatus.data.map((row) => row.id)).toEqual([FAILED_EMAIL, OLD])

    const secondPage = await service.list({ page: 2, limit: 1, filter: november })
    expect(secondPage).toMatchObject({ count: 2, totalPages: 2 })
    expect(secondPage.data.map((row) => row.id)).toEqual([FAILED_EMAIL])
  })

  it('reads one request with its history, delivery counts and a redacted error', async () => {
    const detail = await service.findOne(FAILED_EMAIL)

    expect(detail.statusHistory.map((change) => change.status)).toEqual([
      'queued',
      'processing',
      'failed',
    ])
    expect(detail.deliveryCounts).toEqual([
      { channel: 'EMAIL', status: 'failed', count: 1 },
      { channel: 'EMAIL', status: 'sent', count: 1 },
    ])
    expect(detail.errorReason).toBe('CHES rejected [recipient]')
    const json = JSON.stringify(detail)
    expect(json).not.toContain('gov.bc.ca')
    expect(json).not.toContain('secret')
  })

  it("pages a request's deliveries without their addresses", async () => {
    const result = await service.listDeliveries(FAILED_EMAIL, {
      page: 1,
      limit: 15,
      filter: ['status:in:failed'],
    })

    expect(result.count).toBe(1)
    expect(result.data[0]).toMatchObject({
      status: 'failed',
      attemptCount: 3,
      errorMessage: '550 [recipient] unknown',
      providerResponse: '{"to":"[recipient]"}',
    })
    expect(JSON.stringify(result)).not.toContain('jane')
  })
})
