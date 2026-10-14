import type { FC, ReactNode } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import StickyBar from '@/components/StickyBar'

type TemplateFormActionsProps = {
  onCancel: () => void
  onPreview: () => void
  isPreviewDisabled: boolean
  children?: ReactNode
}

// Cancel and Preview buttons shared by the template create and edit forms; the page supplies its own Save button.
const TemplateFormActions: FC<TemplateFormActionsProps> = ({
  onCancel,
  onPreview,
  isPreviewDisabled,
  children,
}) => (
  <StickyBar>
    <Button type="button" variant="secondary" onClick={onCancel}>
      Cancel
    </Button>
    <Button type="button" variant="secondary" onPress={onPreview} isDisabled={isPreviewDisabled}>
      Preview
    </Button>
    {children}
  </StickyBar>
)

export default TemplateFormActions
