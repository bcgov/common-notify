import type { FC } from 'react'
import type { TemplateResponse } from '@/api/templates.api'

interface Props {
  template: TemplateResponse
}

/**
 * The chosen template shown raw, not rendered.
 *
 * Deliberately unrendered: this is what tells the user which placeholders their spreadsheet has to
 * fill in. The rendered version, with one row's values substituted, is the preview modal's job.
 */
const TemplatePreview: FC<Props> = ({ template }) => (
  <div className="bulk-notifications__preview">
    <span className="bulk-notifications__field-label">Template Preview</span>
    <div className="bulk-notifications__preview-box">
      {template.subject && (
        <p className="bulk-notifications__preview-subject">
          <strong>Subject line:</strong> {template.subject}
        </p>
      )}
      <p className="bulk-notifications__preview-label">
        <strong>Body text:</strong>
      </p>
      <pre className="bulk-notifications__preview-body">{template.body}</pre>
    </div>
  </div>
)

export default TemplatePreview
