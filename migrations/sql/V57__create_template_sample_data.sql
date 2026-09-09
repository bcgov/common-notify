CREATE TABLE notify.template_sample_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    sample_data JSONB,
    created_by VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(200) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_template_sample_data_template FOREIGN KEY (template_id) REFERENCES notify.template (id) ON DELETE CASCADE,
    CONSTRAINT fk_template_sample_data_tenant FOREIGN KEY (tenant_id) REFERENCES notify.tenant (id) ON DELETE CASCADE,
    CONSTRAINT uq_template_sample_data_template_tenant UNIQUE (template_id, tenant_id)
);

CREATE TRIGGER trg_template_sample_data_updated_at
    BEFORE UPDATE ON notify.template_sample_data
    FOR EACH ROW EXECUTE FUNCTION notify.set_updated_at();

COMMENT ON TABLE notify.template_sample_data IS 'Latest sample data for each tenant template, shared by template preview flows.';
COMMENT ON COLUMN notify.template_sample_data.sample_data IS 'Sample variable values used to render a template preview.';
