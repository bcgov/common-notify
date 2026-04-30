-- Add foreign key constraint from notification_request to tenant
ALTER TABLE notification_request ADD CONSTRAINT fk_notification_request_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create index for tenant_id lookups (improves query performance)
CREATE INDEX idx_notification_request_tenant_id ON notification_request (tenant_id);

COMMENT ON CONSTRAINT fk_notification_request_tenant ON notification_request IS 'Foreign key linking notification request to the tenant that submitted it';
