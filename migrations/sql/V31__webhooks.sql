CREATE TABLE notify.webhook_type (
    code VARCHAR(20) PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(200)
);

COMMENT ON TABLE notify.webhook_type IS 'Defines webhook types that determine the payload format sent to the webhook endpoint.';

INSERT INTO notify.webhook_type (code, description, created_by)
VALUES
('generic', 'Generic webhook', 'system'),
('teams', 'Microsoft Teams webhook', 'system');

CREATE TABLE notify.webhook_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  url VARCHAR(2048) NOT NULL,
  secret VARCHAR(512),
  active BOOLEAN DEFAULT true,
  headers JSONB,
  channel_type JSONB,
  trigger_on JSONB,
  webhook_type VARCHAR(20) NOT NULL DEFAULT 'generic' REFERENCES notify.webhook_type(code),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(200),
  updated_by VARCHAR(200),
  UNIQUE(tenant_id, url)
);

COMMENT ON TABLE notify.webhook_config IS 'Stores webhook endpoint configurations per tenant, including the target URL, secret, headers, and rules for which channels and events trigger delivery.';

CREATE TABLE notify.webhook_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_config_id UUID NOT NULL REFERENCES webhook_config(id) ON DELETE CASCADE,
  notification_id UUID REFERENCES notification_request(id),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  event_type VARCHAR(100),
  http_status_code INT,
  response_body TEXT,
  attempt_number INT DEFAULT 1,
  next_retry_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'SENT',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE notify.webhook_delivery_log IS 'Tracks each webhook delivery attempt, including HTTP status, response body, retry scheduling, and final delivery status.';

CREATE INDEX idx_webhook_config_tenant ON webhook_config(tenant_id, active);
CREATE INDEX idx_webhook_delivery_log_webhook ON webhook_delivery_log(webhook_config_id);
CREATE INDEX idx_webhook_delivery_log_notification ON webhook_delivery_log(notification_id);
CREATE INDEX idx_webhook_delivery_log_status ON webhook_delivery_log(status);