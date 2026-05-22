-- Create mime_type_code table (code table pattern)
CREATE TABLE
  IF NOT EXISTS notify.mime_type_code (
    code VARCHAR(255) NOT NULL PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_by VARCHAR(200)
  );

-- Trigger to automatically update updated_at timestamp
DROP TRIGGER IF EXISTS trg_mime_type_code_updated_at ON notify.mime_type_code;
CREATE TRIGGER trg_mime_type_code_updated_at BEFORE
UPDATE ON notify.mime_type_code FOR EACH ROW EXECUTE FUNCTION notify.set_updated_at ();

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_mime_type_code_description ON notify.mime_type_code (description);

-- Table comments
COMMENT ON TABLE notify.mime_type_code IS 'Code table for allowed attachment MIME types. Defines which MIME types can be used for inline attachments in notification requests.';

COMMENT ON COLUMN notify.mime_type_code.code IS 'MIME type code (e.g., application/pdf). Primary key.';

COMMENT ON COLUMN notify.mime_type_code.description IS 'Human-readable description of the MIME type.';

COMMENT ON COLUMN notify.mime_type_code.display_name IS 'Sentence-case display name for UI rendering (e.g., "PDF Document", "PNG Image"). Used in dropdowns and forms.';

COMMENT ON COLUMN notify.mime_type_code.created_at IS 'Timestamp when the MIME type code was created.';

COMMENT ON COLUMN notify.mime_type_code.created_by IS 'User or process that created this record.';

COMMENT ON COLUMN notify.mime_type_code.updated_at IS 'Timestamp when the MIME type code was last updated. Automatically maintained by trg_mime_type_code_updated_at trigger.';

COMMENT ON COLUMN notify.mime_type_code.updated_by IS 'User or process that last updated this record.';

-- Seed MIME type codes
INSERT INTO
  notify.mime_type_code (
    code,
    description,
    display_name,
    created_by,
    updated_by
  )
VALUES
  (
    'application/pdf',
    'Portable Document Format',
    'PDF Document',
    'system',
    'system'
  ),
  (
    'application/msword',
    'Microsoft Word (.doc)',
    'Word Document',
    'system',
    'system'
  ),
  (
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'Microsoft Word (.docx)',
    'Word Document',
    'system',
    'system'
  ),
  (
    'application/vnd.ms-excel',
    'Microsoft Excel (.xls)',
    'Excel Spreadsheet',
    'system',
    'system'
  ),
  (
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Microsoft Excel (.xlsx)',
    'Excel Spreadsheet',
    'system',
    'system'
  ),
  (
    'text/plain',
    'Plain text (.txt)',
    'Text File',
    'system',
    'system'
  ),
  (
    'text/csv',
    'Comma-separated values',
    'CSV File',
    'system',
    'system'
  ),
  (
    'application/zip',
    'ZIP compressed archive',
    'ZIP Archive',
    'system',
    'system'
  ),
  (
    'image/png',
    'Portable Network Graphics',
    'PNG Image',
    'system',
    'system'
  ),
  (
    'image/jpeg',
    'JPEG image format',
    'JPEG Image',
    'system',
    'system'
  ),
  (
    'image/gif',
    'Graphics Interchange Format',
    'GIF Image',
    'system',
    'system'
  ) ON CONFLICT (code) DO NOTHING;

-- Create configuration table for application-level settings
CREATE TABLE
  IF NOT EXISTS notify.configuration (
    key VARCHAR(255) NOT NULL PRIMARY KEY,
    config JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_by VARCHAR(200)
  );

-- Trigger to automatically update updated_at timestamp
DROP TRIGGER IF EXISTS trg_configuration_updated_at ON notify.configuration;
CREATE TRIGGER trg_configuration_updated_at BEFORE
UPDATE ON notify.configuration FOR EACH ROW EXECUTE FUNCTION notify.set_updated_at ();

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_configuration_key ON notify.configuration (key);

CREATE INDEX IF NOT EXISTS idx_configuration_config ON notify.configuration USING GIN (config);

-- Table comments
COMMENT ON TABLE notify.configuration IS 'Stores application configuration values as JSONB for runtime validation and limits.';

COMMENT ON COLUMN notify.configuration.key IS 'Unique configuration key. Primary key.';

COMMENT ON COLUMN notify.configuration.config IS 'Configuration payload stored as JSONB. Includes value, type, and description metadata.';

COMMENT ON COLUMN notify.configuration.created_at IS 'Timestamp when the configuration record was created.';

COMMENT ON COLUMN notify.configuration.created_by IS 'User or process that created this record.';

COMMENT ON COLUMN notify.configuration.updated_at IS 'Timestamp when the configuration record was last updated. Automatically maintained by trg_configuration_updated_at trigger.';

COMMENT ON COLUMN notify.configuration.updated_by IS 'User or process that last updated this record.';

-- Seed configuration values
INSERT INTO
  notify.configuration (
    key,
    config,
    created_by,
    updated_by
  )
VALUES
  (
    'attachment_max_size_mb',
    '{"value": 5, "type": "number", "description": "Maximum individual attachment size in MB"}'::JSONB,
    'system',
    'system'
  ),
  (
    'attachment_max_request_size_mb',
    '{"value": 25, "type": "number", "description": "Maximum total request body size in MB"}'::JSONB,
    'system',
    'system'
  ),
  (
    'attachment_max_filename_length',
    '{"value": 255, "type": "number", "description": "Maximum attachment filename length"}'::JSONB,
    'system',
    'system'
  ) ON CONFLICT (key) DO NOTHING;
