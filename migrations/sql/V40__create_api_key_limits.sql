-- V40: Per-API-key notification limits, usage counters, and alert configuration.
--
-- Replicates GC Notify's "approaching your limits" behaviour for Notify. Tables:
--   0. usage_period_type_code - code table for the usage bucket granularity (MINUTE/DAY/YEAR).
--   1. api_key_limit          - the configured numeric limits per (api key, channel).
--   2. api_key_usage          - rolling counter buckets used to monitor usage and retain
--                               per-fiscal-year history.
--   3. api_key_limit_alert    - per-(api key, channel) alert configuration (warning threshold,
--                               enabled flag).
--
-- api_key_limit and api_key_limit_alert are seeded when an API key is bound to a tenant
-- (one-time onboarding). Limits are keyed on api_key_consumer (which maps to a tenant via
-- api_key_consumer.tenant_id). Per-tenant totals are obtained by joining
-- api_key_usage -> api_key_consumer and aggregating.

-- ---------------------------------------------------------------------------
-- 0. Usage period type (code table pattern)
-- ---------------------------------------------------------------------------
CREATE TABLE
  notify.usage_period_type_code (
    period_type_code VARCHAR(20) PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    sort_order INTEGER NOT NULL DEFAULT 999,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_by VARCHAR(200)
  );

COMMENT ON TABLE notify.usage_period_type_code IS 'Code table for usage counter granularity. Defines the valid window types for api_key_usage buckets and limit checks.';
COMMENT ON COLUMN notify.usage_period_type_code.period_type_code IS 'Period type code (MINUTE, DAY, YEAR). Primary key.';
COMMENT ON COLUMN notify.usage_period_type_code.description IS 'Human-readable description of the period type.';
COMMENT ON COLUMN notify.usage_period_type_code.display_name IS 'Display label for the period type.';
COMMENT ON COLUMN notify.usage_period_type_code.sort_order IS 'Ordering hint for display.';
COMMENT ON COLUMN notify.usage_period_type_code.created_at IS 'Timestamp when the period type code was created.';
COMMENT ON COLUMN notify.usage_period_type_code.created_by IS 'User or process that created this record.';
COMMENT ON COLUMN notify.usage_period_type_code.updated_at IS 'Timestamp when the period type code was last updated.';
COMMENT ON COLUMN notify.usage_period_type_code.updated_by IS 'User or process that last updated this record.';

INSERT INTO
  notify.usage_period_type_code (period_type_code, description, display_name, sort_order, created_by, updated_by)
VALUES
  ('MINUTE', 'Per-minute window, used for API rate limiting', 'Per minute', 10, 'system', 'system'),
  ('DAY', 'Per-calendar-day window, used for the daily maximum', 'Daily', 20, 'system', 'system'),
  ('YEAR', 'Per-fiscal-year window, used for the annual maximum and retained as history', 'Annual', 30, 'system', 'system')
ON CONFLICT (period_type_code) DO NOTHING;

CREATE INDEX idx_usage_period_type_code_description ON notify.usage_period_type_code (description);

-- ---------------------------------------------------------------------------
-- Global fiscal-year start (shared by all annual limits).
-- Stored in the existing notify.configuration table (created in V33). The annual window
-- runs from this month/day each year with no end date; the prior window becomes history.
-- ---------------------------------------------------------------------------
INSERT INTO
  notify.configuration (key, config, created_by, updated_by)
VALUES
  (
    'fiscal_year_start',
    '{"month": 4, "day": 1, "type": "object", "description": "Month and day the annual notification limit window resets for all tenants (fiscal year start)"}'::JSONB,
    'system',
    'system'
  ) ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1. Limit configuration (numeric limits)
-- ---------------------------------------------------------------------------
CREATE TABLE
  notify.api_key_limit (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    api_key_consumer_id UUID NOT NULL,
    channel_code VARCHAR(20) NOT NULL,
    rate_limit_per_minute INTEGER NOT NULL,
    daily_limit BIGINT NOT NULL,
    annual_limit BIGINT NOT NULL,
    -- The annual window resets on the globally-configured fiscal-year start
    -- (notify.configuration key 'fiscal_year_start', default April 1) and has no end date;
    -- the prior window simply becomes history.
    created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    updated_by VARCHAR(200),
    CONSTRAINT pk_api_key_limit PRIMARY KEY (id),
    CONSTRAINT uq_api_key_limit UNIQUE (api_key_consumer_id, channel_code),
    CONSTRAINT fk_api_key_limit_consumer FOREIGN KEY (api_key_consumer_id) REFERENCES notify.api_key_consumer (id) ON DELETE CASCADE,
    CONSTRAINT fk_api_key_limit_channel FOREIGN KEY (channel_code) REFERENCES notify.notification_channel_code (channel_code),
    CONSTRAINT chk_api_key_limit_rate CHECK (rate_limit_per_minute > 0),
    CONSTRAINT chk_api_key_limit_daily CHECK (daily_limit > 0),
    CONSTRAINT chk_api_key_limit_annual CHECK (annual_limit > 0)
  );

CREATE INDEX idx_api_key_limit_consumer ON notify.api_key_limit (api_key_consumer_id);

COMMENT ON TABLE notify.api_key_limit IS 'Configured numeric notification limits per (API key, channel). Populated once when an API key is linked to a tenant during onboarding.';
COMMENT ON COLUMN notify.api_key_limit.api_key_consumer_id IS 'The API key (api_key_consumer) these limits apply to.';
COMMENT ON COLUMN notify.api_key_limit.channel_code IS 'Channel the limits apply to (EMAIL, SMS). Limits differ per channel.';
COMMENT ON COLUMN notify.api_key_limit.rate_limit_per_minute IS 'Maximum notifications accepted per minute (API rate limit).';
COMMENT ON COLUMN notify.api_key_limit.daily_limit IS 'Maximum notifications per calendar day.';
COMMENT ON COLUMN notify.api_key_limit.annual_limit IS 'Maximum notifications per fiscal year. The year boundary is set globally via notify.configuration key ''fiscal_year_start''.';

-- ---------------------------------------------------------------------------
-- 2. Usage counters (and history)
-- ---------------------------------------------------------------------------
-- One row per (api key, channel, period granularity, period start). Incremented atomically on
-- each accepted send via an upsert:
--
--   INSERT INTO notify.api_key_usage
--     (api_key_consumer_id, channel_code, period_type_code, period_start, sent_count)
--   VALUES ($1, $2, 'DAY', date_trunc('day', now()), 1)
--   ON CONFLICT (api_key_consumer_id, channel_code, period_type_code, period_start)
--   DO UPDATE SET sent_count = notify.api_key_usage.sent_count + 1, updated_at = now();
--
-- YEAR rows are retained permanently and form the per-fiscal-year history. DAY rows give daily
-- history; MINUTE rows are transient and may be pruned after a short retention window.
CREATE TABLE
  notify.api_key_usage (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    api_key_consumer_id UUID NOT NULL,
    channel_code VARCHAR(20) NOT NULL,
    period_type_code VARCHAR(20) NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    sent_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    CONSTRAINT pk_api_key_usage PRIMARY KEY (id),
    CONSTRAINT uq_api_key_usage UNIQUE (api_key_consumer_id, channel_code, period_type_code, period_start),
    CONSTRAINT fk_api_key_usage_consumer FOREIGN KEY (api_key_consumer_id) REFERENCES notify.api_key_consumer (id) ON DELETE CASCADE,
    CONSTRAINT fk_api_key_usage_channel FOREIGN KEY (channel_code) REFERENCES notify.notification_channel_code (channel_code),
    CONSTRAINT fk_api_key_usage_period FOREIGN KEY (period_type_code) REFERENCES notify.usage_period_type_code (period_type_code),
    CONSTRAINT chk_api_key_usage_count CHECK (sent_count >= 0)
  );

-- Fast lookup of the current bucket for rate/daily/annual checks.
CREATE INDEX idx_api_key_usage_lookup ON notify.api_key_usage (api_key_consumer_id, channel_code, period_type_code, period_start DESC);

COMMENT ON TABLE notify.api_key_usage IS 'Rolling notification counters per (API key, channel, period). MINUTE/DAY/YEAR buckets are incremented on each accepted send. YEAR (and DAY) rows are retained as usage history; MINUTE rows are prunable.';
COMMENT ON COLUMN notify.api_key_usage.period_type_code IS 'Granularity of the bucket (FK to usage_period_type_code): MINUTE (rate limit), DAY (daily max), YEAR (annual max / fiscal-year history).';
COMMENT ON COLUMN notify.api_key_usage.period_start IS 'Inclusive start of the bucket. For YEAR this is the fiscal-year anchor (e.g. April 1); for DAY/MINUTE it is the truncated timestamp.';
COMMENT ON COLUMN notify.api_key_usage.sent_count IS 'Number of notifications sent in this bucket.';

-- ---------------------------------------------------------------------------
-- 3. Alert configuration
-- ---------------------------------------------------------------------------
-- Per-(API key, channel) configuration for limit alerts. Seeded when an API key is bound.
-- Holds the warning threshold and an enabled flag; the 100% (limit reached) alert is implicit
-- and always fires. When the alerting job is built, a separate delivery/dedupe log can be added
-- without conflating configuration with history.
CREATE TABLE
  notify.api_key_limit_alert (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    api_key_consumer_id UUID NOT NULL,
    channel_code VARCHAR(20) NOT NULL,
    warn_threshold_percent SMALLINT NOT NULL DEFAULT 80,
    alerts_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    updated_by VARCHAR(200),
    CONSTRAINT pk_api_key_limit_alert PRIMARY KEY (id),
    CONSTRAINT uq_api_key_limit_alert UNIQUE (api_key_consumer_id, channel_code),
    CONSTRAINT fk_api_key_limit_alert_consumer FOREIGN KEY (api_key_consumer_id) REFERENCES notify.api_key_consumer (id) ON DELETE CASCADE,
    CONSTRAINT fk_api_key_limit_alert_channel FOREIGN KEY (channel_code) REFERENCES notify.notification_channel_code (channel_code),
    CONSTRAINT chk_api_key_limit_alert_threshold CHECK (warn_threshold_percent BETWEEN 1 AND 100)
  );

CREATE INDEX idx_api_key_limit_alert_consumer ON notify.api_key_limit_alert (api_key_consumer_id);

COMMENT ON TABLE notify.api_key_limit_alert IS 'Per-(API key, channel) limit-alert configuration. Seeded when an API key is bound to a tenant. Holds the warning threshold and an enabled flag; the 100% (limit reached) alert always fires.';
COMMENT ON COLUMN notify.api_key_limit_alert.api_key_consumer_id IS 'The API key (api_key_consumer) this alert config applies to.';
COMMENT ON COLUMN notify.api_key_limit_alert.channel_code IS 'Channel the alert config applies to (EMAIL, SMS).';
COMMENT ON COLUMN notify.api_key_limit_alert.warn_threshold_percent IS 'Percent of a limit at which a warning alert is sent (default 80).';
COMMENT ON COLUMN notify.api_key_limit_alert.alerts_enabled IS 'Whether limit alerts are enabled for this key/channel.';

-- ---------------------------------------------------------------------------
-- Backfill default limits and alert config for any API keys already linked.
-- New keys get these rows created during onboarding (bind).
-- ---------------------------------------------------------------------------
INSERT INTO
  notify.api_key_limit (
    api_key_consumer_id,
    channel_code,
    rate_limit_per_minute,
    daily_limit,
    annual_limit,
    created_by,
    updated_by
  )
SELECT
  akc.id,
  d.channel_code,
  d.rate_limit_per_minute,
  d.daily_limit,
  d.annual_limit,
  'system',
  'system'
FROM
  notify.api_key_consumer akc
  CROSS JOIN (
    VALUES
      ('EMAIL', 1000, 100000, 20000000),
      ('SMS', 1000, 10000, 100000)
  ) AS d (channel_code, rate_limit_per_minute, daily_limit, annual_limit)
ON CONFLICT (api_key_consumer_id, channel_code) DO NOTHING;

INSERT INTO
  notify.api_key_limit_alert (
    api_key_consumer_id,
    channel_code,
    warn_threshold_percent,
    created_by,
    updated_by
  )
SELECT
  akc.id,
  d.channel_code,
  80,
  'system',
  'system'
FROM
  notify.api_key_consumer akc
  CROSS JOIN (
    VALUES
      ('EMAIL'),
      ('SMS')
  ) AS d (channel_code)
ON CONFLICT (api_key_consumer_id, channel_code) DO NOTHING;
