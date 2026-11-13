import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { AlertDialog, Modal, ProgressCircle } from '@bcgov/design-system-react-components'
import { getPreviousTemplateVersion, NotificationChannel } from '@/api/templates.api'
import type { TemplateResponse, TemplateVersionResponse } from '@/api/templates.api'
import Alert from '@/components/Alert'
import EmailTemplatePreview from '@/components/EmailTemplatePreview'
import PreviousVersionSmsEstimate from './PreviousVersionSmsEstimate'
import '@/scss/components/templates.scss'

type PreviousTemplateVersionProps = {
  template: Pick<TemplateResponse, 'id' | 'version' | 'updatedAt' | 'updatedByName' | 'channelCode'>
}

const MODAL_TITLE = 'Previous Version'

/**
 * refetches the previous version every time the modal loads
 */
const PreviousVersionContent: FC<{ templateId: string; isSms: boolean }> = ({
  templateId,
  isSms,
}) => {
  const [version, setVersion] = useState<TemplateVersionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Dropped if the modal closes before the response lands.
    let isCurrent = true

    getPreviousTemplateVersion(templateId)
      .then((previous) => {
        if (isCurrent) setVersion(previous)
      })
      .catch((err: unknown) => {
        if (isCurrent) {
          setError(err instanceof Error ? err.message : 'Failed to load previous version')
        }
      })

    return () => {
      isCurrent = false
    }
  }, [templateId])

  if (error) return <Alert variant="danger">{error}</Alert>

  if (!version) {
    return (
      <div className="previous-template-version__loading">
        <ProgressCircle isIndeterminate aria-label="Loading previous version" size="medium" />
      </div>
    )
  }

  const editedOn = new Date(version.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })

  return (
    <>
      <h3 className="previous-template-version__name">{version.name}</h3>
      <p className="previous-template-version__edited">
        Edit made on {editedOn}
        {version.createdByName ? `, by ${version.createdByName}` : ''}
      </p>
      <EmailTemplatePreview subject={version.subject} body={version.body} />
      {isSms && <PreviousVersionSmsEstimate body={version.body} />}
    </>
  )
}

/** Displays the content of the previous template version as well as when it was updated and who updated it.*/
const PreviousTemplateVersion: FC<PreviousTemplateVersionProps> = ({ template }) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="previous-template-version__updated">
      Last updated on{' '}
      {new Date(template.updatedAt).toLocaleString(undefined, {
        dateStyle: 'long',
        timeStyle: 'short',
      })}
      {template.updatedByName ? `, by ${template.updatedByName}.` : '.'}{' '}
      {template.version > 1 && (
        <button
          type="button"
          className="btn btn-link p-0 align-baseline"
          onClick={() => setIsOpen(true)}
        >
          See previous version
        </button>
      )}
      <Modal isOpen={isOpen} isDismissable onOpenChange={setIsOpen}>
        <AlertDialog
          isIconHidden
          isCloseable
          title={MODAL_TITLE}
          // AlertDialog renders `title` as a plain div rather than a <Heading slot="title">, so
          // the underlying Dialog needs an explicit label.
          aria-label={MODAL_TITLE}
        >
          <div className="previous-template-version">
            <PreviousVersionContent
              templateId={template.id}
              isSms={template.channelCode === NotificationChannel.SMS}
            />
          </div>
        </AlertDialog>
      </Modal>
    </div>
  )
}

export default PreviousTemplateVersion
