CREATE TABLE webhook_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  url VARCHAR(2048) NOT NULL,
  secret VARCHAR(512),
  active BOOLEAN DEFAULT true,
  headers JSONB,
  channel_type VARCHAR(20),
  trigger_on JSONB,
  webhook_type VARCHAR(20) NOT NULL DEFAULT 'generic',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  UNIQUE(tenant_id, url)
);

CREATE TABLE webhook_delivery_log (
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

CREATE INDEX idx_webhook_config_tenant ON webhook_config(tenant_id, active);
CREATE INDEX idx_webhook_delivery_log_webhook ON webhook_delivery_log(webhook_config_id);
CREATE INDEX idx_webhook_delivery_log_notification ON webhook_delivery_log(notification_id);
CREATE INDEX idx_webhook_delivery_log_status ON webhook_delivery_log(status);