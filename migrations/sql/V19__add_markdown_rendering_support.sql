-- Add markdown rendering support to templates
-- Allows templates to render output as markdown -> HTML
ALTER TABLE template
ADD COLUMN render_as_markdown BOOLEAN DEFAULT FALSE NOT NULL;

-- Create index for quick filtering of markdown templates
CREATE INDEX idx_template_render_as_markdown ON template (render_as_markdown);

-- Add markdown rendering support to template versions
-- Allows tracking of markdown settings across template versions
ALTER TABLE template_version
ADD COLUMN render_as_markdown BOOLEAN DEFAULT FALSE NOT NULL;

-- Create index for quick filtering of markdown versions
CREATE INDEX idx_template_version_render_as_markdown ON template_version (render_as_markdown);
