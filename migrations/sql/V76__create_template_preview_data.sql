-- V76: Sample values for previewing a template.
--
-- The template editor's preview asks for a value per placeholder. Those values used to live only
-- in browser memory, so they were gone on the next visit, and the events page - which previews
-- the same template - started from blank fields. One row per template keeps them in one place
-- for both screens and for everyone in the tenant.
--
-- Keyed by placeholder name rather than tied to a template version: a value keeps working across
-- edits for as long as the placeholder exists, and a placeholder that has been removed is simply
-- not read.
BEGIN;

CREATE TABLE notify.template_preview_data (
    template_id UUID NOT NULL,
    params JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(200) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(200) NOT NULL,
    CONSTRAINT pk_template_preview_data PRIMARY KEY (template_id),
    CONSTRAINT fk_template_preview_data_template FOREIGN KEY (template_id) REFERENCES notify.template (id) ON DELETE CASCADE,
    -- A map of placeholder name to value; the application reads it as one.
    CONSTRAINT chk_template_preview_data_params_object CHECK (jsonb_typeof(params) = 'object')
);

CREATE TRIGGER trg_template_preview_data_updated_at
    BEFORE UPDATE ON notify.template_preview_data
    FOR EACH ROW EXECUTE FUNCTION notify.set_updated_at();

COMMENT ON TABLE notify.template_preview_data IS 'Sample placeholder values used to preview a template, one row per template. Shared by the template editor and the events page preview. Sample data only - never used for a real send.';
COMMENT ON COLUMN notify.template_preview_data.template_id IS 'Template the values belong to. Also the primary key: a template has one set of preview values. Cascade deleted with the template.';
COMMENT ON COLUMN notify.template_preview_data.params IS 'Preview values keyed by placeholder name, e.g. {"firstName": "Jane"}. Booleans are stored as the strings "true"/"false", as the preview form holds them.';
COMMENT ON COLUMN notify.template_preview_data.created_at IS 'Timestamp with timezone when preview values were first saved for the template.';
COMMENT ON COLUMN notify.template_preview_data.created_by IS 'Identifier of the user who first saved preview values for the template.';
COMMENT ON COLUMN notify.template_preview_data.updated_at IS 'Timestamp with timezone when the preview values were last saved. Maintained by trg_template_preview_data_updated_at.';
COMMENT ON COLUMN notify.template_preview_data.updated_by IS 'Identifier of the user who last saved the preview values.';

COMMIT;
