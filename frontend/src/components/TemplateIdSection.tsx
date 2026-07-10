import { useState } from 'react'
import type { FC } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import { showErrorToast } from '@/redux/utils/toastUtils'

interface TemplateIdSectionProps {
  templateId: string
}

const TemplateIdSection: FC<TemplateIdSectionProps> = ({ templateId }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(templateId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      showErrorToast('Failed to copy template ID')
    }
  }

  return (
    <div className="template-id-section" aria-label="API data template ID">
      <p className="template-id-section__label">API data: Template ID</p>
      <code className="template-id-section__value">{templateId}</code>
      <div className="template-id-section__actions">
        <Button type="button" variant="secondary" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy template ID'}
        </Button>
      </div>
    </div>
  )
}

export default TemplateIdSection
