-- Sample values for previewing a template, shared by both preview screens and everyone in the tenant.
-- Values are keyed by placeholder name so they survive template version changes.
-- Removed placeholders are ignored when reading the values.
BEGIN;

CREATE TABLE notify.template_preview_data (
  template_id UUID NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by VARCHAR(200) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(200) NOT NULL,
  CONSTRAINT pk_template_preview_data PRIMARY KEY (template_id),
  CONSTRAINT fk_template_preview_data_template FOREIGN KEY (template_id)
    REFERENCES notify.template (id) ON DELETE CASCADE,
  CONSTRAINT chk_template_preview_data_params_object CHECK (jsonb_typeof(params) = 'object')
);

CREATE TRIGGER trg_template_preview_data_updated_at
BEFORE UPDATE ON notify.template_preview_data
FOR EACH ROW EXECUTE FUNCTION notify.set_updated_at();

COMMENT ON TABLE notify.template_preview_data IS
  'Sample placeholder values used to preview a template, one row per template. Shared by the template editor and the events page preview. Sample data only - never used for a real send.';
COMMENT ON COLUMN notify.template_preview_data.template_id IS
  'Template the values belong to. Also the primary key: a template has one set of preview values. Cascade deleted with the template.';
COMMENT ON COLUMN notify.template_preview_data.params IS
  'Preview values keyed by placeholder name, e.g. {"firstName": "Jane"}. Booleans are stored as the strings "true"/"false", as the preview form holds them.';
COMMENT ON COLUMN notify.template_preview_data.created_at IS
  'Timestamp with timezone when preview values were first saved for the template.';
COMMENT ON COLUMN notify.template_preview_data.created_by IS
  'Identifier of the user who first saved preview values for the template.';
COMMENT ON COLUMN notify.template_preview_data.updated_at IS
  'Timestamp with timezone when the preview values were last saved. Maintained by trg_template_preview_data_updated_at.';
COMMENT ON COLUMN notify.template_preview_data.updated_by IS
  'Identifier of the user who last saved the preview values.';

COMMIT;
