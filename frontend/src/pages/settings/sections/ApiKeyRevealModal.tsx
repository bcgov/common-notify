import { useState } from 'react'
import type { FC } from 'react'
import {
  Button,
  SvgCheckCircleIcon,
  SvgExclamationIcon,
} from '@bcgov/design-system-react-components'
import GenericModal from '@/components/GenericModal'

interface ApiKeyRevealModalProps {
  isOpen: boolean
  /** 'Generate API Key' the first time, 'New API Key' after a rotation. */
  title: string
  /** The one-time key value. Held in component state only; never put in the store. */
  apiKey: string
  /** Existing note, so a rotation does not appear to discard what was already recorded. */
  initialNotes: string
  /** Called with the note when the dialog is dismissed, by Done or by the close button. */
  onClose: (notes: string) => void
  isSavingNotes?: boolean
}

const NOTES_MAX_LENGTH = 500

/**
 * Shows a freshly issued key.
 *
 * The value exists only here: Notify never stores it and the gateway will not return it
 * again, so the dialog leads with that and offers a copy button before anything else.
 *
 * Notes are captured here rather than before generating because that is the order the
 * user works in — they write down where they put the key once they have it.
 */
const ApiKeyRevealModal: FC<ApiKeyRevealModalProps> = ({
  isOpen,
  title,
  apiKey,
  initialNotes,
  onClose,
  isSavingNotes = false,
}) => {
  const [notes, setNotes] = useState(initialNotes)
  const [didCopy, setDidCopy] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(apiKey)
      setDidCopy(true)
    } catch {
      // Clipboard access can be blocked by the browser or unavailable over plain HTTP.
      // The key is on screen and selectable, so a failed copy is not worth an error
      // dialog — just don't claim it worked.
      setDidCopy(false)
    }
  }

  return (
    <GenericModal
      isOpen={isOpen}
      onClose={() => onClose(notes)}
      title={title}
      cancelText={isSavingNotes ? 'Saving…' : 'Done'}
    >
      {/* GenericModal only applies its flex/gap layout on the submit branch, and this
          dialog has no submit — just Done — so it spaces its own contents. */}
      <div className="api-key__reveal">
        <div className="api-key__warning" role="alert">
          {/* The DS icons take no className, so the span carries the styling. */}
          <span className="api-key__warning-icon" aria-hidden="true">
            <SvgExclamationIcon />
          </span>
          <div>
            <p className="api-key__warning-title">This key is only shown once</p>
            <p className="api-key__warning-body">
              Copy and store your API key now. After you close this dialog, you won&apos;t be able
              to retrieve the key again.
            </p>
          </div>
        </div>

        <h3 className="api-key__reveal-heading" id="api-key-value-label">
          Your API Key
        </h3>
        <p className="api-key__value" aria-labelledby="api-key-value-label">
          <code>{apiKey}</code>
        </p>

        <div className="api-key__copy-row">
          <Button type="button" variant="secondary" onClick={handleCopy}>
            Copy API Key
          </Button>
          {didCopy && (
            <span className="api-key__copied" role="status">
              <SvgCheckCircleIcon />
              API Key copied
            </span>
          )}
        </div>

        {/* Native textarea rather than the design system's, which takes no placeholder.
            Same approach the template editor uses. */}
        <div className="api-key__notes-field">
          <label className="bcds-react-aria-TextField--Label" htmlFor="api-key-notes">
            API key notes
          </label>
          <textarea
            id="api-key-notes"
            className="form-control"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optionally record where this API key is stored"
            maxLength={NOTES_MAX_LENGTH}
            disabled={isSavingNotes}
            rows={2}
          />
        </div>
      </div>
    </GenericModal>
  )
}

export default ApiKeyRevealModal
