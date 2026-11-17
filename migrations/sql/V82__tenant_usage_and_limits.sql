-- V81: Key notification usage, limits and limit alerts on the tenant instead of the API key.
--
-- V40 and V43 keyed these on api_key_consumer, so only sends made with an API key were counted
-- or limited. Sends from the Notify UI (single, bulk and event sends) carry no API key and were
-- neither counted nor checked. Limits were already tenant-wide in practice: usage was summed
-- across a tenant's keys and checked against the lowest limit on any of them.
--
-- Tables (mirroring V40/V43 with tenant_id in place of api_key_consumer_id):
--   1. tenant_limit           - numeric limits per (tenant, channel).
--   2. tenant_usage           - MINUTE/DAY/YEAR counter buckets per (tenant, channel).
--   3. tenant_limit_alert     - warning threshold and enabled flag per (tenant, channel).
--   4. tenant_limit_alert_log - alert claims per (tenant, channel, period, level).
--
-- The api_key_* tables are left in place, no longer written, so this can be rolled back. They
-- are dropped in a later migration.

-- ---------------------------------------------------------------------------
-- 1. Limit configuration
-- ---------------------------------------------------------------------------
CREATE TABLE
  notify.tenant_limit (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    tenant_id UUID NOT NULL,
    channel_code VARCHAR(20) NOT NULL,
    rate_limit_per_minute INTEGER NOT NULL,
    daily_limit BIGINT NOT NULL,
    annual_limit BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    updated_by VARCHAR(200),
    CONSTRAINT pk_tenant_limit PRIMARY KEY (id),
    CONSTRAINT uq_tenant_limit UNIQUE (tenant_id, channel_code),
    CONSTRAINT fk_tenant_limit_tenant FOREIGN KEY (tenant_id) REFERENCES notify.tenant (id) ON DELETE CASCADE,
    CONSTRAINT fk_tenant_limit_channel FOREIGN KEY (channel_code) REFERENCES notify.notification_channel_code (channel_code),
    CONSTRAINT chk_tenant_limit_rate CHECK (rate_limit_per_minute > 0),
    CONSTRAINT chk_tenant_limit_daily CHECK (daily_limit > 0),
    CONSTRAINT chk_tenant_limit_annual CHECK (annual_limit > 0)
  );

COMMENT ON TABLE notify.tenant_limit IS 'Configured numeric notification limits per (tenant, channel). Seeded when a tenant is created.';
COMMENT ON COLUMN notify.tenant_limit.tenant_id IS 'The tenant these limits apply to.';
COMMENT ON COLUMN notify.tenant_limit.channel_code IS 'Channel the limits apply to (EMAIL, SMS). Limits differ per channel.';
COMMENT ON COLUMN notify.tenant_limit.rate_limit_per_minute IS 'Maximum notifications accepted per minute (API rate limit).';
COMMENT ON COLUMN notify.tenant_limit.daily_limit IS 'Maximum notifications per calendar day.';
COMMENT ON COLUMN notify.tenant_limit.annual_limit IS 'Maximum notifications per fiscal year. The year boundary is set globally via notify.configuration key ''fiscal_year_start''.';

-- ---------------------------------------------------------------------------
-- 2. Usage counters (and history)
-- ---------------------------------------------------------------------------
CREATE TABLE
  notify.tenant_usage (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    tenant_id UUID NOT NULL,
    channel_code VARCHAR(20) NOT NULL,
    period_type_code VARCHAR(20) NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    sent_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    CONSTRAINT pk_tenant_usage PRIMARY KEY (id),
    CONSTRAINT uq_tenant_usage UNIQUE (tenant_id, channel_code, period_type_code, period_start),
    CONSTRAINT fk_tenant_usage_tenant FOREIGN KEY (tenant_id) REFERENCES notify.tenant (id) ON DELETE CASCADE,
    CONSTRAINT fk_tenant_usage_channel FOREIGN KEY (channel_code) REFERENCES notify.notification_channel_code (channel_code),
    CONSTRAINT fk_tenant_usage_period FOREIGN KEY (period_type_code) REFERENCES notify.usage_period_type_code (period_type_code),
    CONSTRAINT chk_tenant_usage_count CHECK (sent_count >= 0)
  );

CREATE INDEX idx_tenant_usage_lookup ON notify.tenant_usage (tenant_id, channel_code, period_type_code, period_start DESC);

COMMENT ON TABLE notify.tenant_usage IS 'Rolling notification counters per (tenant, channel, period), incremented on every accepted send whether made with an API key or from the Notify UI. YEAR (and DAY) rows are retained as usage history; MINUTE rows are prunable.';
COMMENT ON COLUMN notify.tenant_usage.period_type_code IS 'Granularity of the bucket (FK to usage_period_type_code): MINUTE (rate limit), DAY (daily max), YEAR (annual max / fiscal-year history).';
COMMENT ON COLUMN notify.tenant_usage.period_start IS 'Inclusive start of the bucket. For YEAR this is the fiscal-year anchor (e.g. April 1); for DAY/MINUTE it is the truncated timestamp.';
COMMENT ON COLUMN notify.tenant_usage.sent_count IS 'Number of notifications sent in this bucket (SMS counted in billable segments).';

-- ---------------------------------------------------------------------------
-- 3. Alert configuration
-- ---------------------------------------------------------------------------
CREATE TABLE
  notify.tenant_limit_alert (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    tenant_id UUID NOT NULL,
    channel_code VARCHAR(20) NOT NULL,
    warn_threshold_percent SMALLINT NOT NULL DEFAULT 80,
    alerts_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    updated_by VARCHAR(200),
    CONSTRAINT pk_tenant_limit_alert PRIMARY KEY (id),
    CONSTRAINT uq_tenant_limit_alert UNIQUE (tenant_id, channel_code),
    CONSTRAINT fk_tenant_limit_alert_tenant FOREIGN KEY (tenant_id) REFERENCES notify.tenant (id) ON DELETE CASCADE,
    CONSTRAINT fk_tenant_limit_alert_channel FOREIGN KEY (channel_code) REFERENCES notify.notification_channel_code (channel_code),
    CONSTRAINT chk_tenant_limit_alert_threshold CHECK (warn_threshold_percent BETWEEN 1 AND 100)
  );

COMMENT ON TABLE notify.tenant_limit_alert IS 'Per-(tenant, channel) limit-alert configuration. Seeded when a tenant is created. Holds the warning threshold and an enabled flag; the 100% (limit reached) alert always fires.';
COMMENT ON COLUMN notify.tenant_limit_alert.warn_threshold_percent IS 'Percent of a limit at which a warning alert is sent (default 80).';
COMMENT ON COLUMN notify.tenant_limit_alert.alerts_enabled IS 'Whether limit alerts are enabled for this tenant/channel.';

-- ---------------------------------------------------------------------------
-- 4. Alert dedupe / delivery log
-- ---------------------------------------------------------------------------
CREATE TABLE
  notify.tenant_limit_alert_log (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    tenant_id UUID NOT NULL,
    channel_code VARCHAR(20) NOT NULL,
    period_type_code VARCHAR(20) NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    alert_level VARCHAR(20) NOT NULL,
    notification_request_id UUID,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    enqueued_at TIMESTAMPTZ,
    CONSTRAINT pk_tenant_limit_alert_log PRIMARY KEY (id),
    CONSTRAINT uq_tenant_limit_alert_log UNIQUE (
      tenant_id,
      channel_code,
      period_type_code,
      period_start,
      alert_level
    ),
    CONSTRAINT fk_tenant_limit_alert_log_tenant FOREIGN KEY (tenant_id) REFERENCES notify.tenant (id) ON DELETE CASCADE,
    CONSTRAINT fk_tenant_limit_alert_log_channel FOREIGN KEY (channel_code) REFERENCES notify.notification_channel_code (channel_code),
    CONSTRAINT fk_tenant_limit_alert_log_period FOREIGN KEY (period_type_code) REFERENCES notify.usage_period_type_code (period_type_code),
    CONSTRAINT fk_tenant_limit_alert_log_notification_request FOREIGN KEY (notification_request_id) REFERENCES notify.notification_request (id),
    CONSTRAINT chk_tenant_limit_alert_log_level CHECK (alert_level IN ('WARN', 'LIMIT_REACHED'))
  );

COMMENT ON TABLE notify.tenant_limit_alert_log IS 'Atomically claims warning and limit-reached alerts for each tenant usage period, so each fires once.';

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Usage: the tenant's existing counters, summed across its API keys. Matches the totals the
-- usage screens showed before this migration.
INSERT INTO
  notify.tenant_usage (tenant_id, channel_code, period_type_code, period_start, sent_count, created_at, updated_at)
SELECT
  c.tenant_id,
  u.channel_code,
  u.period_type_code,
  u.period_start,
  SUM(u.sent_count),
  MIN(u.created_at),
  MAX(u.updated_at)
FROM
  notify.api_key_usage u
  JOIN notify.api_key_consumer c ON c.id = u.api_key_consumer_id
GROUP BY
  c.tenant_id,
  u.channel_code,
  u.period_type_code,
  u.period_start;

-- Limits: the lowest across the tenant's keys, the value that was being enforced.
INSERT INTO
  notify.tenant_limit (tenant_id, channel_code, rate_limit_per_minute, daily_limit, annual_limit, created_by, updated_by)
SELECT
  c.tenant_id,
  l.channel_code,
  MIN(l.rate_limit_per_minute),
  MIN(l.daily_limit),
  MIN(l.annual_limit),
  'migration',
  'migration'
FROM
  notify.api_key_limit l
  JOIN notify.api_key_consumer c ON c.id = l.api_key_consumer_id
GROUP BY
  c.tenant_id,
  l.channel_code;

-- Then the V40 defaults for every tenant that had no API key. Soft-deleted tenants are included:
-- CSTAR sync still finds them by external id, and nothing reseeds an existing tenant.
INSERT INTO
  notify.tenant_limit (tenant_id, channel_code, rate_limit_per_minute, daily_limit, annual_limit, created_by, updated_by)
SELECT
  t.id,
  d.channel_code,
  d.rate_limit_per_minute,
  d.daily_limit,
  d.annual_limit,
  'migration',
  'migration'
FROM
  notify.tenant t
  CROSS JOIN (
    VALUES
      ('EMAIL', 1000, 100000, 20000000),
      ('SMS', 1000, 10000, 100000)
  ) AS d (channel_code, rate_limit_per_minute, daily_limit, annual_limit)
ON CONFLICT (tenant_id, channel_code) DO NOTHING;

-- Alert config: enabled if any of the tenant's keys had alerts enabled, at the lowest threshold
-- among the enabled ones (the rule LimitAlertService applied).
INSERT INTO
  notify.tenant_limit_alert (tenant_id, channel_code, warn_threshold_percent, alerts_enabled, created_by, updated_by)
SELECT
  c.tenant_id,
  a.channel_code,
  COALESCE(MIN(a.warn_threshold_percent) FILTER (WHERE a.alerts_enabled), MIN(a.warn_threshold_percent)),
  BOOL_OR(a.alerts_enabled),
  'migration',
  'migration'
FROM
  notify.api_key_limit_alert a
  JOIN notify.api_key_consumer c ON c.id = a.api_key_consumer_id
GROUP BY
  c.tenant_id,
  a.channel_code;

INSERT INTO
  notify.tenant_limit_alert (tenant_id, channel_code, warn_threshold_percent, created_by, updated_by)
SELECT
  t.id,
  d.channel_code,
  80,
  'migration',
  'migration'
FROM
  notify.tenant t
  CROSS JOIN (
    VALUES
      ('EMAIL'),
      ('SMS')
  ) AS d (channel_code)
ON CONFLICT (tenant_id, channel_code) DO NOTHING;

-- Alert log: carried over so an alert already sent for the current day or year does not fire again.
INSERT INTO
  notify.tenant_limit_alert_log (
    tenant_id,
    channel_code,
    period_type_code,
    period_start,
    alert_level,
    notification_request_id,
    claimed_at,
    enqueued_at
  )
SELECT DISTINCT ON (c.tenant_id, l.channel_code, l.period_type_code, l.period_start, l.alert_level)
  c.tenant_id,
  l.channel_code,
  l.period_type_code,
  l.period_start,
  l.alert_level,
  l.notification_request_id,
  l.claimed_at,
  l.enqueued_at
FROM
  notify.api_key_limit_alert_log l
  JOIN notify.api_key_consumer c ON c.id = l.api_key_consumer_id
ORDER BY
  c.tenant_id,
  l.channel_code,
  l.period_type_code,
  l.period_start,
  l.alert_level,
  l.claimed_at;
