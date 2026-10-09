import type { FC, ReactNode } from 'react'
import {
  Dialog,
  Modal,
  ProgressCircle,
  SvgChevronLeftIcon,
  SvgChevronRightIcon,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@bcgov/design-system-react-components'
import '@/scss/components/notification-preview.scss'

export type PreviewVariableType = 'text' | 'boolean'

export interface PreviewVariable {
  name: string
  value: string
  type: PreviewVariableType
  /** Marks the field invalid; only meaningful when the list is editable. */
  isInvalid?: boolean
  errorMessage?: string
}

export interface PreviewStepper {
  /** e.g. "Email notification 1 of 63" */
  label: string
  onPrevious: () => void
  onNext: () => void
  hasPrevious: boolean
  hasNext: boolean
}

interface NotificationPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  title: string

  /** Left pane: the values the body is rendered from. */
  variables: PreviewVariable[]
  variablesIntro: string
  /** When false the values are shown as read-only - they came from somewhere else, e.g. a CSV row. */
  isEditable?: boolean
  onVariableChange?: (name: string, value: string) => void
  /** Control under the variable list, such as "Apply to Preview". */
  variablesFooter?: ReactNode
  stepper?: PreviewStepper

  /** Right pane: the message as it will be delivered. */
  from?: string
  to?: string
  /** Only the event email settings carry these; the other previews send to a single recipient. */
  cc?: string
  bcc?: string
  subject?: string
  /** Rendered HTML body. When absent, `bodyText` is shown as plain text instead. */
  bodyHtml?: string
  bodyText?: string
  /** Replaces the rendered output entirely, e.g. a raw-template tab or an "unavailable" notice. */
  bodyOverride?: ReactNode
  /** Control above the output, such as a Rendered/Raw toggle. */
  outputHeader?: ReactNode
  /** Rendered SMS body with counts, shown only after a successful preview. */
  smsPreview?: ReactNode
  isLoading?: boolean
  error?: string | null

  /** Primary action in the modal footer, such as "Send notification (63)". */
  footer?: ReactNode
  variablesHeading?: string
  notice?: ReactNode
  outputFooter?: ReactNode
  closeButton?: ReactNode
  className?: string
}

/**
 * Shared preview shell: the values on the left, the message as it will be delivered on the right.
 *
 * Used by both the template editor and the bulk send screen, which differ only in where the values
 * come from (typed in, or read off a spreadsheet row) and what the footer does.
 */
/** The rendered output, in the order the modal prefers it. */
const RenderedOutput: FC<{
  bodyOverride?: ReactNode
  error?: string | null
  isLoading?: boolean
  smsPreview?: ReactNode
  bodyHtml?: string
  bodyText?: string
}> = ({ bodyOverride, error, isLoading, smsPreview, bodyHtml, bodyText }) => {
  if (bodyOverride) return <>{bodyOverride}</>
  if (error) return <p className="notification-preview__error">{error}</p>
  if (isLoading) {
    // Indeterminate: a render is a single request with no measurable progress, so a
    // percentage would be invented.
    return (
      <div className="notification-preview__loading">
        <ProgressCircle isIndeterminate aria-label="Rendering preview" size="medium" />
        <p className="notification-preview__placeholder">Rendering preview...</p>
      </div>
    )
  }
  if (smsPreview) return <>{smsPreview}</>
  if (bodyHtml !== undefined) {
    // A sandboxed iframe with no allow-* tokens: the template is tenant-authored, so its markup
    // runs with no script, no forms and no access to this document, and its styles cannot leak
    // into the app.
    return (
      <iframe
        className="notification-preview__frame"
        title="Rendered email"
        sandbox=""
        srcDoc={bodyHtml}
      />
    )
  }
  return <pre className="notification-preview__text">{bodyText}</pre>
}

/** One preview value: a True/False pair for a boolean, a text field for anything else. */
const VariableField: FC<{
  variable: PreviewVariable
  isEditable?: boolean
  onVariableChange?: (name: string, value: string) => void
}> = ({ variable, isEditable, onVariableChange }) => {
  if (variable.type === 'boolean') {
    // A True/False pair rather than a switch: the value is one of two named states the template
    // branches on, and it reads the same whether the field is editable here or fixed by a
    // spreadsheet row.
    return (
      <div className="notification-preview__field-toggle">
        <ToggleButtonGroup
          label={variable.name}
          size="small"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[variable.value === 'true' ? 'true' : 'false']}
          isDisabled={!isEditable}
          onSelectionChange={(keys) => {
            const [selected] = keys
            if (selected != null) {
              onVariableChange?.(variable.name, String(selected))
            }
          }}
        >
          <ToggleButton id="true" size="small">
            True
          </ToggleButton>
          <ToggleButton id="false" size="small">
            False
          </ToggleButton>
        </ToggleButtonGroup>
      </div>
    )
  }

  // Wrap rather than pass `className`: the design system spreads props over its own class, so a
  // className here would strip it and break the invalid state.
  return (
    <div className="notification-preview__field-text">
      <TextField
        label={variable.name}
        value={variable.value}
        onChange={(value) => onVariableChange?.(variable.name, value)}
        isReadOnly={!isEditable}
        isRequired={isEditable}
        isInvalid={variable.isInvalid}
        errorMessage={variable.errorMessage}
      />
    </div>
  )
}

const NotificationPreviewModal: FC<NotificationPreviewModalProps> = ({
  isOpen,
  onClose,
  title,
  variables,
  variablesIntro,
  isEditable = false,
  onVariableChange,
  variablesFooter,
  stepper,
  from,
  to,
  cc,
  bcc,
  subject,
  bodyHtml,
  bodyText,
  bodyOverride,
  outputHeader,
  smsPreview,
  isLoading = false,
  error = null,
  footer,
  variablesHeading = 'Preview data',
  notice,
  outputFooter,
  closeButton,
  className,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      isDismissable
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog aria-labelledby="notification-preview-title">
        <div className={['notification-preview', className].filter(Boolean).join(' ')}>
          <div className="notification-preview__header">
            <h5 className="notification-preview__title" id="notification-preview-title">
              {title}
            </h5>
            {closeButton}
          </div>

          {notice}

          <div className="notification-preview__body">
            <div className="notification-preview__data">
              {stepper && (
                <div className="notification-preview__stepper">
                  <span className="notification-preview__position" aria-live="polite">
                    {stepper.label}
                  </span>
                  <button
                    type="button"
                    className="notification-preview__nav"
                    onClick={stepper.onPrevious}
                    disabled={!stepper.hasPrevious}
                    aria-label="Previous"
                  >
                    <SvgChevronLeftIcon />
                  </button>
                  <button
                    type="button"
                    className="notification-preview__nav"
                    onClick={stepper.onNext}
                    disabled={!stepper.hasNext}
                    aria-label="Next"
                  >
                    <SvgChevronRightIcon />
                  </button>
                </div>
              )}

              <h6 className="notification-preview__heading">{variablesHeading}</h6>
              <p className="notification-preview__intro">{variablesIntro}</p>

              {variables.length === 0 ? (
                <p className="notification-preview__intro">No variables found.</p>
              ) : (
                <div className="notification-preview__fields">
                  {variables.map((variable) => (
                    <VariableField
                      key={variable.name}
                      variable={variable}
                      isEditable={isEditable}
                      onVariableChange={onVariableChange}
                    />
                  ))}
                </div>
              )}

              {variablesFooter && (
                <div className="notification-preview__data-footer">{variablesFooter}</div>
              )}
            </div>

            <div className="notification-preview__output-pane">
              {(from || to || cc || bcc || subject) && (
                <dl className="notification-preview__envelope">
                  {from && (
                    <div className="notification-preview__envelope-row">
                      <dt>From:</dt>
                      <dd>{from}</dd>
                    </div>
                  )}
                  {to && (
                    <div className="notification-preview__envelope-row">
                      <dt>To:</dt>
                      <dd>{to}</dd>
                    </div>
                  )}
                  {cc && (
                    <div className="notification-preview__envelope-row">
                      <dt>Cc:</dt>
                      <dd>{cc}</dd>
                    </div>
                  )}
                  {bcc && (
                    <div className="notification-preview__envelope-row">
                      <dt>Bcc:</dt>
                      <dd>{bcc}</dd>
                    </div>
                  )}
                  {subject && (
                    <div className="notification-preview__envelope-row">
                      <dt>Subject line:</dt>
                      <dd>{subject}</dd>
                    </div>
                  )}
                </dl>
              )}

              {outputHeader}

              <RenderedOutput
                bodyOverride={bodyOverride}
                error={error}
                isLoading={isLoading}
                smsPreview={smsPreview}
                bodyHtml={bodyHtml}
                bodyText={bodyText}
              />
            </div>
          </div>

          {footer && <div className="notification-preview__footer">{footer}</div>}
        </div>
      </Dialog>
    </Modal>
  )
}

export default NotificationPreviewModal
