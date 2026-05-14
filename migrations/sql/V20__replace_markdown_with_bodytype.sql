-- Replace render_as_markdown boolean with body_type string column
-- Supports: 'text' (plain), 'markdown' (markdown->HTML), 'html' (raw HTML)
-- Drop old indexes before altering tables
DROP INDEX IF EXISTS idx_template_render_as_markdown;

DROP INDEX IF EXISTS idx_template_version_render_as_markdown;

-- Update template table
-- Add new body_type column with default 'html'
ALTER TABLE template
ADD COLUMN body_type VARCHAR(20) DEFAULT 'html' NOT NULL;

-- Migrate existing data: if render_as_markdown is true, set to 'markdown', else 'html'
UPDATE template
SET
  body_type = CASE
    WHEN render_as_markdown = true THEN 'markdown'
    ELSE 'html'
  END;

-- Drop old render_as_markdown column
ALTER TABLE template
DROP COLUMN render_as_markdown;

-- Create index for body_type filtering
CREATE INDEX idx_template_body_type ON template (body_type);

-- Update template_version table
-- Add new body_type column with default 'html'
ALTER TABLE template_version
ADD COLUMN body_type VARCHAR(20) DEFAULT 'html' NOT NULL;

-- Migrate existing data: if render_as_markdown is true, set to 'markdown', else 'html'
UPDATE template_version
SET
  body_type = CASE
    WHEN render_as_markdown = true THEN 'markdown'
    ELSE 'html'
  END;

-- Drop old render_as_markdown column
ALTER TABLE template_version
DROP COLUMN render_as_markdown;

-- Create index for body_type filtering
CREATE INDEX idx_template_version_body_type ON template_version (body_type);
